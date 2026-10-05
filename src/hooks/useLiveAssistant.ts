import { useCallback, useEffect, useRef, useState } from "react";
import { assistantLiveSession, assistantTool } from "../api/assistant";
import { useI18n } from "../i18n";

/**
 * A spoken, two-way conversation with the camp assistant (GPT-Live).
 *
 * The browser owns the media: the microphone and the speaker ride a WebRTC
 * connection straight to the model, so both sides can talk at once and the
 * person can cut the assistant off mid-sentence. The backend only trades the
 * SDP (keeping the API key) and runs the MongoDB tools the model asks for,
 * which arrive here on the `oai-events` data channel.
 */
export type LiveStatus = "idle" | "connecting" | "live" | "ended" | "error";
export type LiveSpeaker = "user" | "assistant" | null;

export interface LiveTurn {
  id: number;
  role: "user" | "assistant";
  text: string;
  endMs: number;
}

export interface LiveLevels {
  /** what the lantern's star follows: the loudest voice right now */
  level: number;
  user: number;
  assistant: number;
}

/** transcript fragments this far apart (ms) start a new bubble instead of growing the last one */
const TURN_GAP_MS = 2500;
const SPEAKING_FLOOR = 0.05;
const SPEAKING_HOLD_MS = 650;
const CONNECT_TIMEOUT_MS = 15_000;
const ICE_TIMEOUT_MS = 10_000;

interface Delegation {
  calls: number;
  done: boolean;
  used: boolean;
}

function readLevel(analyser: AnalyserNode | null, buffer: Uint8Array): number {
  if (!analyser) return 0;
  analyser.getByteTimeDomainData(buffer);
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    const value = (buffer[i] - 128) / 128;
    sum += value * value;
  }
  return Math.min(1, Math.sqrt(sum / buffer.length) * 4.5);
}

/** No trickle ICE on an HTTP offer/answer: the offer has to carry every candidate. */
function waitForIce(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      pc.removeEventListener("icegatheringstatechange", check);
      clearTimeout(timer);
    };
    const check = () => {
      if (pc.iceGatheringState !== "complete") return;
      cleanup();
      resolve();
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Não foi possível preparar a conexão de áudio. Tente novamente."));
    }, ICE_TIMEOUT_MS);
    pc.addEventListener("icegatheringstatechange", check);
    check();
  });
}

export function useLiveAssistant(token: string, userName = "", onNavigate?: (rawArgs: string) => string) {
  const { te } = useI18n();
  const [status, setStatus] = useState<LiveStatus>("idle");
  const statusRef = useRef<LiveStatus>("idle");
  const [error, setError] = useState("");
  const [turns, setTurns] = useState<LiveTurn[]>([]);
  const [talking, setTalking] = useState<LiveSpeaker>(null);
  const [thinking, setThinking] = useState(false);
  const [muted, setMuted] = useState(false);

  const levelRef = useRef<LiveLevels>({ level: 0, user: 0, assistant: 0 });
  const audioRef = useRef<HTMLAudioElement>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analysersRef = useRef<{ user: AnalyserNode | null; assistant: AnalyserNode | null }>({ user: null, assistant: null });
  const frameRef = useRef(0);
  const bufferRef = useRef(new Uint8Array(512));
  const speakerRef = useRef<LiveSpeaker>(null);
  const heardRef = useRef({ user: 0, assistant: 0 });
  const mutedRef = useRef(false);
  const delegationsRef = useRef(new Map<string, Delegation>());
  const turnId = useRef(1);
  const eventId = useRef(1);
  const greetedRef = useRef(false);

  const applyStatus = useCallback((next: LiveStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const teardown = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
    analysersRef.current = { user: null, assistant: null };
    delegationsRef.current.clear();
    greetedRef.current = false;
    dcRef.current?.close();
    dcRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    micRef.current?.getTracks().forEach((track) => track.stop());
    micRef.current = null;
    void ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    if (audioRef.current) audioRef.current.srcObject = null;
    levelRef.current = { level: 0, user: 0, assistant: 0 };
    speakerRef.current = null;
    setTalking(null);
    setThinking(false);
  }, []);

  const send = useCallback((event: Record<string, unknown>) => {
    const channel = dcRef.current;
    if (channel?.readyState !== "open") return;
    channel.send(JSON.stringify({ event_id: `acampa_${eventId.current++}`, ...event }));
  }, []);

  const appendTurn = useCallback((role: "user" | "assistant", delta: unknown, startMs: number, endMs: number) => {
    if (typeof delta !== "string" || !delta) return;
    setTurns((list) => {
      const last = list[list.length - 1];
      if (last && last.role === role && startMs - last.endMs < TURN_GAP_MS) {
        return [...list.slice(0, -1), { ...last, text: last.text + delta, endMs: Math.max(last.endMs, endMs) }];
      }
      return [...list, { id: turnId.current++, role, text: delta, endMs }];
    });
  }, []);

  const delegationOf = useCallback((id: string): Delegation => {
    const found = delegationsRef.current.get(id);
    if (found) return found;
    const fresh: Delegation = { calls: 0, done: false, used: false };
    delegationsRef.current.set(id, fresh);
    return fresh;
  }, []);

  /** A backend turn only moves on once every tool it asked for has an answer. */
  const resumeDelegation = useCallback((id: string) => {
    const delegation = delegationsRef.current.get(id);
    if (!delegation || delegation.calls > 0 || !delegation.done) return;
    if (delegation.used) send({ type: "response.create" });
    delegationsRef.current.delete(id);
    if (!delegationsRef.current.size) setThinking(false);
  }, [send]);

  const runTool = useCallback(async (id: string, call: { call_id?: string; name?: string; arguments?: string }) => {
    if (!call.call_id || !call.name) return;
    const delegation = delegationOf(id);
    delegation.calls += 1;
    delegation.used = true;
    setThinking(true);
    let output = JSON.stringify({ error: "A consulta não pôde ser feita agora." });
    try {
      output = call.name === "navigate_app" && onNavigate
        ? onNavigate(call.arguments ?? "{}")
        : (await assistantTool(token, call.name, call.arguments ?? "{}")).output;
    } catch (failure) {
      console.error("live assistant tool failed", failure);
    }
    send({ type: "response.item.create", item: { type: "function_call_output", call_id: call.call_id, output } });
    delegation.calls -= 1;
    resumeDelegation(id);
  }, [delegationOf, onNavigate, resumeDelegation, send, token]);

  const handleEvent = useCallback((raw: string) => {
    let message: Record<string, any>;
    try {
      message = JSON.parse(raw) as Record<string, any>;
    } catch {
      return;
    }
    switch (message.type) {
      case "session.started":
        applyStatus("live");
        if (!greetedRef.current) {
          greetedRef.current = true;
          const firstName = userName.trim().split(/\s+/)[0]?.replace(/[^\p{L}'’-]/gu, "") ?? "";
          send({
            type: "session.instructions.append",
            event_id: "acampa_greeting_instruction",
            delegation_id: null,
            content: `Sua primeira fala deve ser somente: "Olá${firstName ? ` ${firstName}` : ""}! Meu nome é Sareca. O que você tá precisando?" Não acrescente outra apresentação nem explicação.`,
          });
        }
        break;
      case "session.instructions.appended":
        if (message.client_event_id === "acampa_greeting_instruction") {
          send({
            type: "session.commentary.append",
            delegation_id: null,
            content: "Comece a conversa agora, seguindo a saudação curta que acabou de receber.",
          });
        }
        break;
      case "session.input_transcript.delta":
        appendTurn("user", message.delta, message.start_ms ?? 0, message.end_ms ?? 0);
        break;
      case "session.output_transcript.delta":
        appendTurn("assistant", message.delta, message.start_ms ?? 0, message.end_ms ?? 0);
        break;
      case "session.delegation.created":
        setThinking(true);
        break;
      case "response.event": {
        const inner = message.event as { type?: string; item?: { type?: string; call_id?: string; name?: string; arguments?: string } } | undefined;
        const id = String(message.delegation_id ?? "");
        if (!inner || !id) break;
        if (inner.type === "response.output_item.done" && inner.item?.type === "function_call") {
          void runTool(id, inner.item);
        } else if (inner.type === "response.completed" || inner.type === "response.failed" || inner.type === "response.incomplete") {
          delegationOf(id).done = true;
          resumeDelegation(id);
        }
        break;
      }
      case "session.closed":
        if (statusRef.current !== "error") applyStatus("ended");
        break;
      case "error":
        console.error("live assistant error", message);
        break;
      default:
        break;
    }
  }, [appendTurn, applyStatus, delegationOf, resumeDelegation, runTool, send, userName]);

  const watchLevels = useCallback(() => {
    const tick = () => {
      frameRef.current = requestAnimationFrame(tick);
      const user = mutedRef.current ? 0 : readLevel(analysersRef.current.user, bufferRef.current);
      const assistant = readLevel(analysersRef.current.assistant, bufferRef.current);
      // the person's own voice lights the lantern brightest; the answer keeps it alive
      levelRef.current = { user, assistant, level: Math.max(user, assistant * 0.65) };

      const now = performance.now();
      if (user > SPEAKING_FLOOR) heardRef.current.user = now;
      if (assistant > SPEAKING_FLOOR) heardRef.current.assistant = now;
      const speaker: LiveSpeaker = now - heardRef.current.user < SPEAKING_HOLD_MS
        ? "user"
        : now - heardRef.current.assistant < SPEAKING_HOLD_MS ? "assistant" : null;
      if (speaker !== speakerRef.current) {
        speakerRef.current = speaker;
        setTalking(speaker);
      }
    };
    if (!frameRef.current) frameRef.current = requestAnimationFrame(tick);
  }, []);

  const listen = useCallback((stream: MediaStream, who: "user" | "assistant") => {
    const ctx = ctxRef.current ?? new AudioContext();
    ctxRef.current = ctx;
    void ctx.resume().catch(() => {});
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.55;
    ctx.createMediaStreamSource(stream).connect(analyser);
    analysersRef.current[who] = analyser;
    watchLevels();
  }, [watchLevels]);

  const stop = useCallback(() => {
    if (dcRef.current?.readyState === "open") send({ type: "session.close" });
    teardown();
    if (statusRef.current !== "idle" && statusRef.current !== "error") applyStatus("ended");
  }, [applyStatus, send, teardown]);

  const start = useCallback(async () => {
    if (statusRef.current === "connecting" || statusRef.current === "live") return;
    teardown();
    setError("");
    setTurns([]);
    applyStatus("connecting");
    try {
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      micRef.current = mic;
      mutedRef.current = false;
      setMuted(false);

      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      for (const track of mic.getTracks()) pc.addTrack(track, mic);
      pc.ontrack = (event) => {
        const [stream] = event.streams;
        if (!stream) return;
        if (audioRef.current) {
          audioRef.current.srcObject = stream;
          void audioRef.current.play().catch(() => {});
        }
        listen(stream, "assistant");
      };
      pc.onconnectionstatechange = () => {
        if (pc !== pcRef.current) return;
        if (pc.connectionState === "failed") {
          teardown();
          setError("A conversa caiu. Toque para tentar de novo.");
          applyStatus("error");
        }
      };

      const channel = pc.createDataChannel("oai-events");
      dcRef.current = channel;
      channel.onmessage = (event) => handleEvent(String(event.data));
      // session.started is the real green light; the open channel covers a silent one
      channel.onopen = () => {
        if (pc === pcRef.current && statusRef.current === "connecting") applyStatus("live");
      };

      await pc.setLocalDescription(await pc.createOffer());
      await waitForIce(pc);
      const answer = await assistantLiveSession(token, pc.localDescription?.sdp ?? "");
      if (pc !== pcRef.current) return;
      await pc.setRemoteDescription({ type: "answer", sdp: answer.sdp });
      listen(mic, "user");
      setTimeout(() => {
        if (pc !== pcRef.current || statusRef.current !== "connecting") return;
        teardown();
        setError("O assistente não atendeu. Tente novamente.");
        applyStatus("error");
      }, CONNECT_TIMEOUT_MS);
    } catch (failure) {
      teardown();
      const denied = (failure as Error)?.name === "NotAllowedError" || (failure as Error)?.name === "SecurityError";
      setError(denied
        ? "Preciso do microfone para conversar. Libere o acesso nas permissões do navegador."
        : te(failure, "Não consegui abrir a conversa por voz."));
      applyStatus("error");
    }
  }, [applyStatus, handleEvent, listen, te, teardown, token]);

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    micRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next; });
    setMuted(next);
  }, []);

  useEffect(() => teardown, [teardown]);

  return { status, error, turns, talking, thinking, muted, levelRef, audioRef, start, stop, toggleMute };
}
