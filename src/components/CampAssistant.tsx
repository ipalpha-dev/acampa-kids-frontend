import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import flame from "../assets/flame.gif";
import { assistantStatus, type AssistantStatus } from "../api/assistant";
import { getState } from "../store";
import { navigate } from "../router";
import { useGlowVar } from "../hooks/useGlowVar";
import { useLiveAssistant } from "../hooks/useLiveAssistant";
import { useI18n } from "../i18n";
import LanternMark from "./LanternMark";

interface CampAssistantProps {
  token: string;
  userName: string;
  availableTabs: readonly string[];
  availableSettings: readonly string[];
  /** Keep the launcher above another floating action while the assistant is closed. */
  avoidFab?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const SCREEN_REQUEST = /\b(?:mostr(?:a|e|ar)|exib(?:a|e|ir)|coloc(?:a|ar|que)|p(?:õe|oe|onha))\b[^.!?]{0,40}\b(?:tela|visual|escrito)|\bescrev(?:a|e|er)\b|\bna tela\b|\bshow\b[^.!?]{0,30}\bscreen\b/i;
const DISMISS_REQUEST = /\b(?:tchau|até mais|era só isso|é só isso|obrigad[oa],? era só isso|pode (?:fechar|encerrar|parar|ir|se retirar)|fech(?:a|e|ar)(?: o assistente| a conversa)?|encerr(?:a|e|ar)(?: o assistente| a conversa)?|dispensad[oa])\b/i;
const KEEP_OPEN_REQUEST = /\b(?:não|nao)\s+(?:fech(?:a|e|ar)|encerr(?:a|e|ar)|par(?:a|e|ar))\b/i;
const HANDOFF_CORRECTION = /\b(?:não|nao|errad[oa]|outr[oa]|volta|voltar|espera|pera|calma|continua|quis dizer|eu queria|abre|abra|mostra|mostre|vai para|vá para)\b/i;

type NavigationArgs = { destination?: unknown; record_id?: unknown; name?: unknown };

function normalized(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

/** Conservative fuzzy match for voice transcription variants such as Kevin/Kevyn. */
function editDistance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return previous[b.length];
}

function fuzzyRecord<T extends { id: string; name?: string; title?: string }>(list: readonly T[] | undefined, spoken: string): T | null {
  if (!list?.length) return null;
  const wanted = normalized(spoken);
  if (!wanted) return null;
  const exact = list.filter((item) => normalized(item.name ?? item.title ?? "") === wanted);
  if (exact.length === 1) return exact[0];
  const partial = list.filter((item) => normalized(item.name ?? item.title ?? "").includes(wanted));
  if (partial.length === 1) return partial[0];

  const score = (item: T) => {
    const label = normalized(item.name ?? item.title ?? "");
    const choices = [label, ...label.split(" ")];
    return Math.min(...choices.map((choice) => editDistance(wanted, choice)));
  };
  const ranked = list.map((item) => ({ item, distance: score(item) })).sort((a, b) => a.distance - b.distance);
  const limit = wanted.length <= 4 ? 1 : wanted.length <= 8 ? 2 : 3;
  if (ranked[0].distance > limit) return null;
  // Never guess between equally plausible people. The assistant can ask which one.
  if (ranked[1]?.distance === ranked[0].distance) return null;
  return ranked[0].item;
}

function meaningfulHandoffSpeech(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  if (HANDOFF_CORRECTION.test(text)) return true;
  const words = text.match(/[\p{L}\p{N}]+/gu) ?? [];
  return words.length >= 3 && words.join("").length >= 10;
}

export default function CampAssistant({ token, userName, availableTabs, availableSettings, avoidFab = false, onOpenChange }: CampAssistantProps) {
  const { tx, te } = useI18n();
  const [open, setOpen] = useState(false);
  const [handoff, setHandoff] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [fabReturning, setFabReturning] = useState(false);
  const [showConnecting, setShowConnecting] = useState(false);
  const [service, setService] = useState<AssistantStatus | null>(null);
  const [statusError, setStatusError] = useState("");
  const stageRef = useRef<HTMLElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const dismissedTurnRef = useRef(0);
  const handoffStartedRef = useRef(0);
  const handoffSpokeRef = useRef(false);
  const handoffBaselineRef = useRef({ id: 0, text: "" });
  const latestUserTurnRef = useRef({ id: 0, text: "" });
  const handoffCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fabReturnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const navigateFromAssistant = useCallback((rawArgs: string): string => {
    let args: NavigationArgs;
    try {
      args = JSON.parse(rawArgs) as NavigationArgs;
    } catch {
      return JSON.stringify({ error: "Não entendi qual tela abrir." });
    }
    const destination = typeof args.destination === "string" ? args.destination : "";
    const recordId = typeof args.record_id === "string" ? args.record_id.trim() : "";
    const name = typeof args.name === "string" ? args.name.trim() : "";
    const data = getState().data;
    let matchedLabel = "";
    const findId = (list: readonly { id: string; name?: string; title?: string }[] | undefined) => {
      if (recordId) {
        const found = list?.find((item) => item.id === recordId);
        if (found) {
          matchedLabel = found.name ?? found.title ?? "";
          return found.id;
        }
      }
      if (!name) return "";
      const found = fuzzyRecord(list, name);
      if (!found) return "";
      matchedLabel = found.name ?? found.title ?? "";
      return found.id;
    };
    const detail = (base: string, list: readonly { id: string; name?: string; title?: string }[] | undefined) => {
      const id = findId(list);
      if (!id) return "";
      return `${base}/${encodeURIComponent(id)}`;
    };

    const tabs = new Set(availableTabs);
    const settings = new Set(availableSettings);
    const tabRoutes: Record<string, { tab: string; path: string }> = {
      home: { tab: "home", path: "/home" }, campers: { tab: "campers", path: "/campers" }, staff: { tab: "staff", path: "/staff" },
      bedrooms: { tab: "bedrooms", path: "/bedrooms" }, buses: { tab: "buses", path: "/buses" }, schedule: { tab: "schedule", path: "/schedule" },
      preparation: { tab: "prep", path: "/prep" }, instructions: { tab: "instructions", path: "/instructions" },
      occurrences: { tab: "occurrences", path: "/occurrences" }, medications: { tab: "medications", path: "/medications" },
      checkin: { tab: "checkin", path: "/checkin" }, scoreboard: { tab: "scoreboard", path: "/scoreboard" }, teams: { tab: "teams", path: "/teams" }, gallery: { tab: "gallery", path: "/gallery" },
    };
    const settingRoutes: Record<string, { setting: string; path: string }> = {
      general_settings: { setting: "general", path: "/general" }, trials: { setting: "trials", path: "/trials" },
      categories: { setting: "categories", path: "/categories" }, cleanup: { setting: "cleanup", path: "/cleanup" },
      preparation_settings: { setting: "preparation", path: "/preparation" }, instructions_settings: { setting: "instructions-admin", path: "/instructions-admin" },
      checkin_settings: { setting: "checkin-settings", path: "/checkin-settings" }, organizers: { setting: "organizers", path: "/organizers" },
      game_organizers: { setting: "game-organizers", path: "/game-organizers" }, medical_staff: { setting: "medical", path: "/medical" },
      vest_helpers: { setting: "vests-settings", path: "/vests-settings" }, photographers: { setting: "photographers", path: "/photographers" },
      contacts: { setting: "contacts", path: "/contacts" }, notifications: { setting: "notifications", path: "/notifications" },
      seeds: { setting: "super", path: "/super" }, about: { setting: "about", path: "/about" },
    };

    let path = destination === "profile" ? "/profile" : "";
    const tabRoute = tabRoutes[destination];
    if (tabRoute && tabs.has(tabRoute.tab)) path = tabRoute.path;
    const settingRoute = settingRoutes[destination];
    if (settingRoute && settings.has(settingRoute.setting)) path = settingRoute.path;
    if (destination === "teams" && !path && tabs.has("scoreboard")) path = "/teams";
    if (destination === "settings" && settings.size) path = "/settings";
    if (destination === "schedule_roles" && tabs.has("schedule") && settings.size) path = "/schedule/roles";
    if (destination === "camper" && tabs.has("campers")) path = detail("/campers", data.campers);
    if (destination === "staff_member" && tabs.has("staff")) path = detail("/staff", data.staff);
    if (destination === "bedroom" && tabs.has("bedrooms")) path = detail("/bedrooms", data.bedrooms);
    if (destination === "event" && tabs.has("schedule") && settings.size) path = detail("/schedule/events", data.events);
    if (destination === "instruction") {
      if (tabs.has("instructions")) path = detail("/instructions", data.instructions);
      else if (settings.has("instructions-admin")) path = detail("/instructions-admin", data.instructions);
    }
    if (destination === "scoreboard_team" && tabs.has("scoreboard")) path = detail("/scoreboard/team", data.teams);
    if (destination === "scoreboard_event" && tabs.has("scoreboard")) path = detail("/scoreboard/event", data.events);

    if (!path) return JSON.stringify({ error: name ? `Não encontrei uma única ficha chamada ${name}, ou ela não está disponível para este perfil.` : "Essa tela não está disponível para este perfil." });
    navigate(path);
    if (handoffCloseTimerRef.current) clearTimeout(handoffCloseTimerRef.current);
    handoffStartedRef.current = performance.now();
    handoffSpokeRef.current = false;
    handoffBaselineRef.current = { ...latestUserTurnRef.current };
    setResuming(false);
    setHandoff(true);
    return JSON.stringify({
      ok: true,
      path,
      message: `Tela aberta${matchedLabel ? `: ${matchedLabel}` : ""}. Diga uma despedida muito curta, como 'Pronto, até mais', e não faça outra pergunta. Se a pessoa corrigir a navegação antes da sessão fechar, escute e continue ajudando.`,
    });
  }, [availableSettings, availableTabs]);

  const live = useLiveAssistant(token, userName, navigateFromAssistant);
  const voiceReady = !!service?.enabled;
  const active = live.status === "live" || live.status === "connecting";

  useGlowVar(stageRef, live.levelRef);
  useGlowVar(launcherRef, live.levelRef);

  useEffect(() => () => {
    if (handoffCloseTimerRef.current) clearTimeout(handoffCloseTimerRef.current);
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    if (fabReturnTimerRef.current) clearTimeout(fabReturnTimerRef.current);
  }, []);

  useEffect(() => {
    let cancelled = false;
    assistantStatus(token)
      .then((status) => {
        if (!cancelled) setService(status);
      })
      .catch((error) => {
        if (cancelled) return;
        setService({ enabled: false, voiceModel: "" });
        setStatusError(te(error, "Assistente indisponível."));
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    root.classList.toggle("assistant-is-open", !handoff);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      root.classList.remove("assistant-is-open");
      document.removeEventListener("keydown", onKey);
    };
    // close is intentionally read from the current render while this overlay is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handoff, open]);

  useEffect(() => {
    if (open && voiceReady && live.status === "idle") void live.start();
  }, [live.start, live.status, open, voiceReady]);

  useEffect(() => {
    if (!open || live.status !== "connecting") {
      setShowConnecting(false);
      return;
    }
    const timer = setTimeout(() => setShowConnecting(true), 2000);
    return () => clearTimeout(timer);
  }, [live.status, open]);

  useEffect(() => {
    const lastUser = [...live.turns].reverse().find((turn) => turn.role === "user");
    if (lastUser) latestUserTurnRef.current = { id: lastUser.id, text: lastUser.text };
    if (!handoff || !lastUser || performance.now() - handoffStartedRef.current < 350) return;
    const baseline = handoffBaselineRef.current;
    let fresh = "";
    if (lastUser.id > baseline.id) fresh = lastUser.text;
    else if (lastUser.id === baseline.id && lastUser.text !== baseline.text) {
      fresh = lastUser.text.startsWith(baseline.text) ? lastUser.text.slice(baseline.text.length) : lastUser.text;
    }
    if (!meaningfulHandoffSpeech(fresh)) return;
    if (handoffCloseTimerRef.current) clearTimeout(handoffCloseTimerRef.current);
    handoffCloseTimerRef.current = null;
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    setHandoff(false);
    setResuming(true);
    resumeTimerRef.current = setTimeout(() => {
      resumeTimerRef.current = null;
      setResuming(false);
    }, 620);
  }, [handoff, live.turns]);

  useEffect(() => {
    if (!handoff) return;
    if (live.talking === "assistant") {
      handoffSpokeRef.current = true;
      if (handoffCloseTimerRef.current) clearTimeout(handoffCloseTimerRef.current);
      return;
    }
    // Microphone energy alone only pauses shutdown. The overlay returns only
    // after a meaningful transcript, so coughs and nearby speech cannot reopen it.
    if (live.talking === "user") {
      if (handoffCloseTimerRef.current) clearTimeout(handoffCloseTimerRef.current);
      handoffCloseTimerRef.current = null;
      return;
    }
    if (!handoffSpokeRef.current || live.talking !== null || handoffCloseTimerRef.current) return;
    handoffCloseTimerRef.current = setTimeout(() => {
      handoffCloseTimerRef.current = null;
      live.stop();
      setHandoff(false);
      setResuming(false);
      setOpen(false);
      setFabReturning(true);
      if (fabReturnTimerRef.current) clearTimeout(fabReturnTimerRef.current);
      fabReturnTimerRef.current = setTimeout(() => {
        fabReturnTimerRef.current = null;
        setFabReturning(false);
      }, 720);
      onOpenChange?.(false);
    }, 1400);
    return () => {
      if (handoffCloseTimerRef.current) clearTimeout(handoffCloseTimerRef.current);
      handoffCloseTimerRef.current = null;
    };
  }, [handoff, live.stop, live.talking, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const lastUser = [...live.turns].reverse().find((turn) => turn.role === "user");
    if (!lastUser || lastUser.id === dismissedTurnRef.current) return;
    if (!DISMISS_REQUEST.test(lastUser.text) || KEEP_OPEN_REQUEST.test(lastUser.text)) return;
    dismissedTurnRef.current = lastUser.id;
    live.stop();
    setHandoff(false);
    setResuming(false);
    setOpen(false);
    setFabReturning(true);
    if (fabReturnTimerRef.current) clearTimeout(fabReturnTimerRef.current);
    fabReturnTimerRef.current = setTimeout(() => {
      fabReturnTimerRef.current = null;
      setFabReturning(false);
    }, 720);
    onOpenChange?.(false);
  }, [live.stop, live.turns, onOpenChange, open]);

  const screenText = useMemo(() => {
    let requestAt = -1;
    for (let index = live.turns.length - 1; index >= 0; index--) {
      const turn = live.turns[index];
      if (turn.role !== "user") continue;
      if (SCREEN_REQUEST.test(turn.text)) requestAt = index;
      break;
    }
    if (requestAt < 0) return "";
    for (let index = live.turns.length - 1; index > requestAt; index--) {
      const turn = live.turns[index];
      if (turn.role === "assistant") return turn.text;
    }
    return "";
  }, [live.turns]);

  function openAssistant() {
    dismissedTurnRef.current = 0;
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    if (fabReturnTimerRef.current) clearTimeout(fabReturnTimerRef.current);
    setFabReturning(false);
    setResuming(false);
    setHandoff(false);
    setOpen(true);
    onOpenChange?.(true);
    if (voiceReady && live.status !== "connecting" && live.status !== "live") void live.start();
  }

  /** Closing the focus view also hangs up because voice sessions are billed by duration. */
  function close() {
    if (handoffCloseTimerRef.current) clearTimeout(handoffCloseTimerRef.current);
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    handoffCloseTimerRef.current = null;
    resumeTimerRef.current = null;
    setHandoff(false);
    setResuming(false);
    setOpen(false);
    setFabReturning(true);
    if (fabReturnTimerRef.current) clearTimeout(fabReturnTimerRef.current);
    fabReturnTimerRef.current = setTimeout(() => {
      fabReturnTimerRef.current = null;
      setFabReturning(false);
    }, 720);
    onOpenChange?.(false);
    live.stop();
  }

  return (
    <>
      <button
        ref={launcherRef}
        type="button"
        className={`assistant-launcher ${avoidFab ? "assistant-launcher--with-fab" : ""} ${open ? "assistant-launcher--open" : ""} ${active ? "assistant-launcher--live" : ""} ${fabReturning ? "assistant-launcher--returning" : ""}`}
        title={tx("Conversar com a Sareca")}
        aria-label={tx("Conversar com a Sareca")}
        aria-expanded={open}
        onClick={openAssistant}
      >
        <LanternMark size="100%" />
      </button>

      {open && (
        <>
          <div className={`assistant-backdrop ${screenText ? "assistant-backdrop--display" : ""} ${handoff ? "assistant-backdrop--handoff" : ""} ${resuming ? "assistant-backdrop--resuming" : ""}`} aria-hidden="true" />
          <section ref={stageRef} className={`assistant-stage ${screenText ? "assistant-stage--display" : ""} ${handoff ? "assistant-stage--handoff" : ""} ${resuming ? "assistant-stage--resuming" : ""}`} role="dialog" aria-modal="true" aria-label={tx("Sareca, assistente do acampamento")}>
            <button type="button" className="assistant-stage__close" aria-label={tx("Encerrar conversa")} title={tx("Encerrar conversa")} onClick={close} autoFocus>
              <span aria-hidden="true">×</span>
            </button>

            {screenText && (
              <section className="assistant-stage__display" aria-label={tx("Resposta exibida")}>
                <p>{screenText}</p>
              </section>
            )}

            {(statusError || live.error) && (
              <p className="assistant-stage__error">{tx(live.error || statusError)}</p>
            )}

            <div className={`assistant-stage__lantern ${live.status === "connecting" ? "is-connecting" : "is-lit"}`} aria-hidden="true">
              <span className="assistant-stage__warmth" />
              <LanternMark size="100%" emptyCenter />
              {live.status === "connecting" ? (
                <span className="assistant-stage__ember">
                  <i className="assistant-stage__spark assistant-stage__spark--one" />
                  <i className="assistant-stage__spark assistant-stage__spark--two" />
                </span>
              ) : (
                <img className="assistant-stage__flame" src={flame} alt="" />
              )}
            </div>

            {showConnecting && <p className="assistant-stage__connecting" role="status">{tx("Conectando...")}</p>}
            <audio ref={live.audioRef} autoPlay playsInline />
          </section>
        </>
      )}
    </>
  );
}
