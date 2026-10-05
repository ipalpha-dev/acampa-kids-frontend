import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { DOMParser as PmDOMParser, DOMSerializer } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { aiEdit, aiTranscribe, listAiModels, stripCodeFences, type AiContext, type AiMessage, type AiModel } from "../api/ai";
import { absolutizeFileUrls, relativizeFileUrls, shrinkImage } from "../api/files";
import { pendingImages, resolveGeneratedImages } from "../aiImages";
import { sanitizeForEditor } from "../html";
import { useI18n } from "../i18n";
import AiVendorLogo from "./AiVendorLogo";
import AiDiffDialog from "./AiDiffDialog";
import { AiGlyph } from "./Glyph";

interface AiAssistantPanelProps {
  open: boolean;
  onClose: () => void;
  editor: Editor;
  token: string;
  context?: AiContext;
  title?: string;
  /** called with the new document HTML (relative urls) after a reply is applied to the whole document */
  onApplied?: (html: string) => void;
}

interface ChatItem extends AiMessage {
  id: number;
  /** user only: pictures pasted with the message (data urls) */
  images?: string[];
  /** user only: the message came from a voice recording (content = transcription) */
  voice?: { seconds: number; transcribing: boolean };
  /** assistant only: still streaming */
  pending?: boolean;
  /** assistant only: camp data the model looked up (programação, contatos…) */
  lookups?: string[];
  /** assistant only: live reasoning (model chatter before/during lookups); hidden once answered */
  thought?: string[];
  /** assistant only: new document HTML the model produced (absent = it only answered) */
  doc?: string;
  /** assistant only: the document block is streaming right now */
  writing?: boolean;
  /** assistant only: illustrations being rendered for this reply ("1 de 2") */
  drawing?: { done: number; total: number; what: string };
  /** assistant only: pictures the model asked for that could not be drawn */
  imageErrors?: string[];
  /** assistant only: what the reply targeted */
  target?: { from: number; to: number } | "document";
  /** assistant only: editor HTML before the reply was applied (for "Reverter") */
  before?: string;
  applied?: boolean;
  error?: string;
}

const MODEL_KEY = "camping.ai.model";

/**
 * Keeps the target range highlighted in the editor while the chat is used
 * (the browser drops the native selection once the textarea gets focus) and
 * while the reply is streaming.
 */
const targetKey = new PluginKey<{ from: number; to: number; busy: boolean } | null>("aiTarget");
function targetPlugin() {
  return new Plugin<{ from: number; to: number; busy: boolean } | null>({
    key: targetKey,
    state: {
      init: () => null,
      apply(tr, prev) {
        const meta = tr.getMeta(targetKey) as { from: number; to: number; busy: boolean } | null | undefined;
        if (meta !== undefined) return meta;
        if (!prev) return null;
        return { ...prev, from: tr.mapping.map(prev.from), to: tr.mapping.map(prev.to) };
      },
    },
    props: {
      decorations(state) {
        const t = targetKey.getState(state);
        if (!t || t.from >= t.to) return null;
        return DecorationSet.create(state.doc, [Decoration.inline(t.from, t.to, { class: `ai-target ${t.busy ? "ai-target--busy" : ""}` })]);
      },
    },
  });
}

/** a paste at least this long becomes a chip instead of filling the textarea */
const PASTE_CHIP_MIN = 400;

interface Pasted {
  id: number;
  /** plain text (preview + fallback) */
  text: string;
  /** rich version, already reduced to the editor's schema — what the AI gets when present */
  html?: string;
}

/** block-level structure worth keeping as HTML (inline-only pastes stay plain text) */
const BLOCK_TAGS = /<(h2|h3|ul|ol|blockquote)\b/i;

/**
 * Rich paste → HTML limited to what the editor (and the server sanitizer)
 * accept. Runs the clipboard HTML through the ProseMirror schema, so Word /
 * Google Docs / web-page markup collapses to h2, h3, lists, bold, links…
 * Images are dropped (the AI must never introduce <img>).
 */
function cleanPastedHtml(editor: Editor, html: string): string | null {
  try {
    const doc = new window.DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("img, picture, svg, style, script, meta, link, head").forEach((n) => n.remove());
    const node = PmDOMParser.fromSchema(editor.schema).parse(doc.body);
    const div = document.createElement("div");
    div.appendChild(DOMSerializer.fromSchema(editor.schema).serializeFragment(node.content));
    const out = div.innerHTML.replace(/<p><\/p>/g, "").trim();
    return out ? out : null;
  } catch {
    return null;
  }
}

interface PastedImage {
  id: number;
  /** data url, already shrunk */
  url: string;
}

const MAX_IMAGES = 4;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
/** voice messages: whisper accepts anything ffmpeg reads */
const AUDIO_TYPES = /^audio\//;
/** longest voice message (seconds) */
const MAX_RECORD_SECONDS = 120;

/** first container the browser can record (Chrome/Firefox: webm/opus, Safari: mp4) */
function recordingMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((t) => MediaRecorder.isTypeSupported(t));
}
const CAN_RECORD = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && !!recordingMimeType();

/** number of bars in the live waveform */
const WAVE_BARS = 28;

/**
 * Live mic level bars while recording (fed by an AnalyserNode). Drawn on a
 * canvas at devicePixelRatio; the newest sample enters on the right.
 */
function Waveform({ stream }: { stream: MediaStream }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.6;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    const levels = new Array<number>(WAVE_BARS).fill(0.05);
    let raf = 0;
    let last = 0;
    const color = getComputedStyle(canvas).color || "#9a3f31";
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < 60) return; // ~16 fps: one new bar per tick
      last = now;
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      levels.push(Math.min(1, Math.max(0.05, rms * 4)));
      levels.shift();
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      const g = canvas.getContext("2d");
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      g.fillStyle = color;
      const gap = 2;
      const bw = Math.max(2, (w - gap * (WAVE_BARS - 1)) / WAVE_BARS);
      levels.forEach((lv, i) => {
        const bh = Math.max(3, lv * h);
        const x = i * (bw + gap);
        const y = (h - bh) / 2;
        g.beginPath();
        g.roundRect(x, y, bw, bh, bw / 2);
        g.fill();
      });
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      void ctx.close();
    };
  }, [stream]);
  return <canvas ref={canvasRef} className="ai-voice__wave" aria-hidden />;
}

async function toDataUrl(file: File): Promise<string> {
  const blob = await shrinkImage(file);
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function selectionHtml(editor: Editor): { html: string; from: number; to: number } | null {
  const { from, to, empty } = editor.state.selection;
  if (empty) return null;
  const slice = editor.state.selection.content();
  const div = document.createElement("div");
  div.appendChild(DOMSerializer.fromSchema(editor.schema).serializeFragment(slice.content));
  const html = div.innerHTML.trim();
  return html ? { html: relativizeFileUrls(html), from, to } : null;
}

/**
 * Chat panel that rewrites the editor content (rendered by RichTextEditor in
 * the right column of the AI workspace).
 * Each answer is applied to the editor as soon as it finishes; "Reverter"
 * puts the previous HTML back.
 */
export default function AiAssistantPanel({ open, onClose, editor, token, context, title, onApplied }: AiAssistantPanelProps) {
  const { tx, tag, te } = useI18n();
  const quick = [
    { label: tx("Melhorar"), prompt: tx("Melhore a escrita: deixe o texto mais claro e simpático, mantendo o sentido.") },
    { label: tx("✂️ Resumir"), prompt: tx("Resuma o texto mantendo as informações essenciais.") },
    { label: tx("📝 Corrigir"), prompt: tx("Corrija ortografia e gramática sem mudar o estilo.") },
  ];
  const [models, setModels] = useState<AiModel[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [model, setModel] = useState(() => localStorage.getItem(MODEL_KEY) ?? "");
  const [items, setItems] = useState<ChatItem[]>([]);
  const [draft, setDraft] = useState("");
  const [pasted, setPasted] = useState<Pasted[]>([]);
  const [images, setImages] = useState<PastedImage[]>([]);
  const [preview, setPreview] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [canTranscribe, setCanTranscribe] = useState(false);
  const [recording, setRecording] = useState<MediaStream | null>(null);
  const [recordSeconds, setRecordSeconds] = useState(0);
  /** recorded clip waiting to be sent */
  const [voice, setVoice] = useState<{ blob: Blob; seconds: number } | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordSecondsRef = useRef(0);
  /** resolves with the clip once MediaRecorder flushes its last chunk */
  const stopPromise = useRef<Promise<Blob | null> | null>(null);
  const [hasSelection, setHasSelection] = useState(false);
  /** chat item whose change is being reviewed in the diff dialog */
  const [reviewing, setReviewing] = useState<number | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelMenu, setModelMenu] = useState(false);
  const modelRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const nextId = useRef(1);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingModels(true);
    listAiModels(token)
      .then((r) => {
        if (cancelled) return;
        setEnabled(r.enabled);
        setCanTranscribe(!!r.transcribe);
        setModels(r.models);
        setModel((m) => (r.models.some((x) => x.id === m) ? m : (r.models[0]?.id ?? "")));
      })
      .catch(() => !cancelled && setEnabled(false))
      .finally(() => !cancelled && setLoadingModels(false));
    return () => {
      cancelled = true;
    };
  }, [open, token]);

  useEffect(() => {
    if (model) localStorage.setItem(MODEL_KEY, model);
  }, [model]);


  useEffect(() => {
    if (!modelMenu) return;
    const close = (e: MouseEvent) => {
      if (!modelRef.current?.contains(e.target as Node)) setModelMenu(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setModelMenu(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [modelMenu]);

  // the target range stays highlighted in the editor: the user sees exactly what the request will touch
  useEffect(() => {
    if (!open) return;
    editor.registerPlugin(targetPlugin());
    const update = () => {
      const { from, to, empty } = editor.state.selection;
      setHasSelection(!empty);
      // while a reply streams the plugin keeps the range it got in send(); don't follow the caret
      if (abortRef.current) return;
      const prev = targetKey.getState(editor.state);
      const next = empty ? null : { from, to, busy: false };
      if ((prev?.from ?? -1) === (next?.from ?? -1) && (prev?.to ?? -1) === (next?.to ?? -1) && !prev?.busy) return;
      editor.view.dispatch(editor.state.tr.setMeta(targetKey, next).setMeta("addToHistory", false));
    };
    update();
    editor.on("selectionUpdate", update);
    editor.on("transaction", update);
    return () => {
      editor.off("selectionUpdate", update);
      editor.off("transaction", update);
      if (!editor.isDestroyed) editor.unregisterPlugin(targetKey);
    };
  }, [open, editor]);

  const setTarget = (t: { from: number; to: number; busy: boolean } | null) => {
    if (editor.isDestroyed) return;
    editor.view.dispatch(editor.state.tr.setMeta(targetKey, t).setMeta("addToHistory", false));
  };

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else {
      abortRef.current?.abort();
      recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
      recorderRef.current = null;
    }
  }, [open]);

  // recording clock + hard cap
  useEffect(() => {
    if (!recording) return;
    setRecordSeconds(0);
    const started = Date.now();
    const t = setInterval(() => {
      const s = Math.floor((Date.now() - started) / 1000);
      recordSecondsRef.current = s;
      setRecordSeconds(s);
      if (s >= MAX_RECORD_SECONDS) void stopRecording();
    }, 250);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [items]);

  const patch = (id: number, p: Partial<ChatItem>) => setItems((list) => list.map((x) => (x.id === id ? { ...x, ...p } : x)));

  function applyReply(target: ChatItem["target"], html: string) {
    // a placeholder that was never rendered must not reach the document (the server drops srcless images)
    const clean = sanitizeForEditor(absolutizeFileUrls(stripCodeFences(html)));
    if (!clean) return;
    if (target && target !== "document") {
      const max = editor.state.doc.content.size;
      const from = Math.min(target.from, max);
      const to = Math.min(target.to, max);
      editor.chain().focus().insertContentAt({ from, to }, clean).run();
    } else {
      editor.chain().focus().setContent(clean, { emitUpdate: true }).run();
    }
  }

  async function addImages(files: File[]) {
    const room = MAX_IMAGES - images.length;
    if (room <= 0) return;
    const urls = await Promise.all(files.slice(0, room).map((f) => toDataUrl(f).catch(() => null)));
    setImages((l) => [...l, ...urls.filter((u): u is string => !!u).map((url) => ({ id: nextId.current++, url }))]);
  }

  async function startRecording() {
    if (recording || busy) return;
    setVoiceError(null);
    setVoice(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setVoiceError(tx("Sem acesso ao microfone. Libere a permissão no navegador."));
      return;
    }
    const mimeType = recordingMimeType();
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    stopPromise.current = new Promise<Blob | null>((resolve) => {
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        recorderRef.current = null;
        setRecording(null);
        // container without codec params, so the server sees a clean "audio/webm" / "audio/mp4"
        const type = (rec.mimeType || mimeType || "audio/webm").split(";")[0].trim();
        const blob = new Blob(chunks, { type });
        // shorter than ~half a second = accidental tap
        const clip = blob.size < 2_000 ? null : blob;
        if (clip) setVoice({ blob: clip, seconds: Math.max(1, recordSecondsRef.current) });
        resolve(clip);
      };
    });
    recorderRef.current = rec;
    recordSecondsRef.current = 0;
    rec.start(250);
    setRecording(stream);
  }

  /** stops the mic; resolves with the clip (kept as an attachment until sent or removed) */
  async function stopRecording(): Promise<{ blob: Blob; seconds: number } | null> {
    const rec = recorderRef.current;
    if (!rec || rec.state === "inactive") return null;
    const seconds = Math.max(1, recordSecondsRef.current);
    rec.stop();
    const blob = await (stopPromise.current ?? Promise.resolve(null));
    return blob ? { blob, seconds } : null;
  }

  /** "Enviar" while recording: stop first, then send the clip */
  async function sendNow() {
    const clip = recording ? await stopRecording() : voice;
    void send(draft, pasted, images, clip);
  }

  async function send(text: string, attachments: Pasted[] = [], pics: PastedImage[] = [], clip: { blob: Blob; seconds: number } | null = null) {
    const typed = text.trim();
    const build = (spoken: string) =>
      [
        typed,
        spoken,
        !typed && !spoken && pics.length ? tx("Veja a imagem.") : "",
        ...attachments.map((p) =>
          p.html
            ? tx('Conteúdo colado (HTML, estrutura intencional):\n"""\n{html}\n"""', { html: p.html })
            : tx('Texto colado:\n"""\n{text}\n"""', { text: p.text }),
        ),
      ]
        .filter(Boolean)
        .join("\n\n");
    if ((!build("") && !clip) || busy || !model) return;
    const sel = selectionHtml(editor);
    const target: ChatItem["target"] = sel ? { from: sel.from, to: sel.to } : "document";
    const before = relativizeFileUrls(editor.getHTML());
    const history: AiMessage[] = items.filter((i) => !i.error && !i.pending).map(({ role, content }) => ({ role, content }));
    const suffix = sel ? tx("\n(sobre o trecho selecionado)") : "";
    const userId = nextId.current++;
    const userItem: ChatItem = {
      id: userId,
      role: "user",
      content: build("") + suffix,
      images: pics.map((p) => p.url),
      voice: clip ? { seconds: clip.seconds, transcribing: true } : undefined,
    };
    const replyId = nextId.current++;
    setItems((l) => [...l, userItem, { id: replyId, role: "assistant", content: "", pending: true, target, before }]);
    setDraft("");
    setPasted([]);
    setImages([]);
    setVoice(null);
    setVoiceError(null);
    setPreview(null);
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    if (sel) setTarget({ from: sel.from, to: sel.to, busy: true });
    try {
      let content = build("");
      if (clip) {
        const spoken = await aiTranscribe(token, clip.blob, ctrl.signal);
        if (!spoken) throw new Error(tx("Não entendi nada no áudio. Tente de novo mais perto do microfone."));
        content = build(spoken);
        patch(userId, { content: content + suffix, voice: { seconds: clip.seconds, transcribing: false } });
      }
      const full = await aiEdit(
        token,
        { model, context, title, html: editor.isEmpty ? "" : before, selection: sel?.html ?? null, messages: [...history, { role: "user", content }], images: pics.map((p) => p.url) },
        (p) => patch(replyId, { content: p.reply, doc: p.doc ?? undefined, writing: p.docPending || !!p.doc, lookups: p.lookups, thought: p.thought }),
        ctrl.signal,
      );
      // the model decides: no document block = it just answered, nothing is touched
      if (full.doc) {
        let doc = stripCodeFences(full.doc);
        let imageErrors: string[] | undefined;
        // the model may have asked the app to DRAW pictures (<img data-gen="…">): render them before applying
        if (pendingImages(doc).length) {
          patch(replyId, { content: full.reply, doc, writing: false, lookups: full.lookups, pending: true, drawing: { done: 0, total: pendingImages(doc).length, what: "" } });
          const drawn = await resolveGeneratedImages(token, doc, {
            signal: ctrl.signal,
            onProgress: (done, total, what) => patch(replyId, { drawing: { done, total, what } }),
          });
          doc = drawn.html;
          imageErrors = drawn.failed.length ? drawn.failed : undefined;
        }
        applyReply(target, doc);
        patch(replyId, { content: full.reply, doc, writing: false, drawing: undefined, imageErrors, lookups: full.lookups, thought: undefined, pending: false, applied: true });
        onApplied?.(relativizeFileUrls(editor.getHTML()));
      } else {
        patch(replyId, { content: full.reply, doc: undefined, writing: false, lookups: full.lookups, thought: undefined, pending: false, before: undefined });
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") patch(replyId, { pending: false, error: tx("Cancelado.") });
      else patch(replyId, { pending: false, error: te(err, "O assistente não respondeu.") });
      if (clip) setItems((l) => l.map((x) => (x.id === userId && x.voice?.transcribing ? { ...x, voice: { ...x.voice, transcribing: false } } : x)));
    } finally {
      setBusy(false);
      abortRef.current = null;
      setTarget(null);
      inputRef.current?.focus();
    }
  }

  function revert(item: ChatItem) {
    if (item.before === undefined) return;
    editor.chain().focus().setContent(sanitizeForEditor(absolutizeFileUrls(item.before)) || "", { emitUpdate: true }).run();
    patch(item.id, { applied: false });
  }

  function reapply(item: ChatItem) {
    if (!item.doc) return;
    applyReply(item.target, item.doc);
    patch(item.id, { applied: true });
  }

  if (!open) return null;

  const current = models.find((m) => m.id === model);

  const review = items.find((i) => i.id === reviewing);

  return (
    <aside className="ai-panel" role="complementary" aria-label={tx("Assistente de IA")}>
      {review?.before !== undefined && (
        <AiDiffDialog
          open
          onClose={() => setReviewing(null)}
          before={absolutizeFileUrls(review.before)}
          after={editor.getHTML()}
          onRevert={() => revert(review)}
        />
      )}
      <header className="ai-panel__head">
        <span className="ai-panel__title"><AiGlyph /> {tx("Assistente")}</span>
        <div className="ai-model" ref={modelRef}>
          <button
            type="button"
            className="ai-model__button"
            disabled={busy || loadingModels || !models.length}
            aria-label={tx("Modelo")}
            aria-haspopup="listbox"
            aria-expanded={modelMenu}
            onClick={() => setModelMenu((v) => !v)}
          >
            {loadingModels && !models.length ? (
              tx("Verificando modelos…")
            ) : (
              <>
                <AiVendorLogo vendor={current?.vendor} modelId={current?.id} />
                <span>{current?.label ?? tx("Modelo")}</span>
              </>
            )}
            <span className="ai-model__caret" aria-hidden>▾</span>
          </button>
          {modelMenu && (
            <ul className="ai-model__menu" role="listbox" aria-label={tx("Modelos")}>
              {models.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={m.id === model}
                    className={`ai-model__option ${m.id === model ? "is-active" : ""}`}
                    onClick={() => {
                      setModel(m.id);
                      setModelMenu(false);
                    }}
                  >
                    <AiVendorLogo vendor={m.vendor} modelId={m.id} />
                    <span>{m.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </header>

      <div className="ai-panel__list" ref={listRef}>
        {!enabled && <p className="ai-panel__hint ai-panel__hint--warn">{tx("⚠️ Assistente de IA não configurado no servidor.")}</p>}
        {enabled && !items.length && (
          <div className="ai-panel__hint">
            <p>{tx("Converse normalmente: pergunte sobre o documento ou sobre o acampamento e ele responde aqui; peça uma mudança (“resuma”, “acrescente…”) e ele altera o texto e conta o que fez — dá para reverter.")}</p>
            <p>{tx("Selecione um trecho no editor para tratar só dele.")}</p>
          </div>
        )}
        {items.map((it) => (
          <div key={it.id} className={`ai-msg ai-msg--${it.role} ${it.error ? "ai-msg--error" : ""}`}>
            {it.role === "user" ? (
              <>
                {!!it.images?.length && (
                  <div className="ai-msg__images">
                    {it.images.map((u, i) => (
                      <img key={i} src={u} alt="" />
                    ))}
                  </div>
                )}
                {it.voice && (
                  <p className="ai-msg__voice">
                    {tx("🎤 Áudio · {time}", { time: `${Math.floor(it.voice.seconds / 60)}:${String(it.voice.seconds % 60).padStart(2, "0")}` })}
                    {it.voice.transcribing && <span className="ai-pulse">{tx(" · transcrevendo…")}</span>}
                  </p>
                )}
                {!!it.content && <p className="ai-msg__text">{it.content}</p>}
              </>
            ) : (
              <>
                {it.pending && !!it.thought?.length && (
                  <div className="ai-msg__thought" aria-live="polite">
                    {it.thought.map((t, i) => (
                      <p key={i}>💭 {t}</p>
                    ))}
                    {!!it.lookups?.length && <p>{tx("🔎 Consultou {items}", { items: it.lookups.join(", ") })}</p>}
                  </div>
                )}
                {it.pending && (
                  <p className="ai-msg__status ai-thinking" role="status" aria-live="polite">
                    <span className="ai-thinking__dots" aria-hidden>
                      <i />
                      <i />
                      <i />
                    </span>
                    <span className="ai-pulse">
                      {it.drawing
                        ? tx("🎨 Desenhando {done} de {total}…", { done: Math.min(it.drawing.done + 1, it.drawing.total), total: it.drawing.total })
                        : it.writing
                          ? tx("Escrevendo o documento…")
                          : it.content
                            ? tx("Respondendo…")
                            : it.lookups?.length
                              ? tx("Consultando…")
                              : tx("Pensando…")}
                      {it.writing && it.target && it.target !== "document" ? tx(" (no trecho selecionado)") : ""}
                    </span>
                    {(it.doc?.length ?? it.content.length) > 0 && <span className="ai-msg__count">{it.doc?.length ?? it.content.length}</span>}
                  </p>
                )}
                {it.error && <p className="ai-msg__status">⚠️ {it.error}</p>}
                {!it.pending && !it.error && (
                  <>
                    <p className="ai-msg__answer">{it.content || (it.doc ? tx("Pronto.") : tx("Sem resposta."))}</p>
                    {!!it.lookups?.length && <p className="ai-msg__lookups">{tx("🔎 Consultou {items}", { items: it.lookups.join(", ") })}</p>}
                    {!!it.imageErrors?.length && (
                      <p className="ai-msg__status">
                        {it.imageErrors.length === 1
                          ? tx("⚠️ Não consegui desenhar uma imagem.")
                          : tx("⚠️ Não consegui desenhar {n} imagens.", { n: it.imageErrors.length })}
                      </p>
                    )}
                    {it.doc && (
                      <>
                        <p className="ai-msg__status">
                          {it.applied
                            ? it.target === "document"
                              ? tx("✅ Aplicado no documento")
                              : tx("✅ Aplicado no trecho selecionado")
                            : it.target === "document"
                              ? tx("↩️ Revertido no documento")
                              : tx("↩️ Revertido no trecho selecionado")}
                        </p>
                        <div className="ai-msg__actions">
                          {it.before !== undefined && it.applied && (
                            <button type="button" className="ai-msg__btn ai-msg__btn--review" onClick={() => setReviewing(it.id)} disabled={busy}>
                              {tx("👁 Ver o que mudou")}
                            </button>
                          )}
                          {it.applied ? (
                            <button type="button" className="ai-msg__btn" onClick={() => revert(it)} disabled={busy}>
                              {tx("↶ Reverter")}
                            </button>
                          ) : (
                            <button type="button" className="ai-msg__btn" onClick={() => reapply(it)} disabled={busy}>
                              {tx("↷ Aplicar de novo")}
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      <div className="ai-panel__quick">
        {quick.map((q) => (
          <button key={q.label} type="button" className="ai-panel__chip" disabled={busy || !enabled || !model} onClick={() => void send(q.prompt)}>
            {q.label}
          </button>
        ))}
      </div>

      {/* not a <form>: the editor usually lives inside the document's form, and nested forms submit the outer one */}
      <div className="ai-panel__form">
        {(pasted.length > 0 || images.length > 0 || voice) && (
          <div className="ai-paste">
            {voice && (
              <div className="ai-paste__chip">
                <span className="ai-paste__card ai-paste__audio">
                  {tx("🎤 Áudio gravado · {time}", { time: `${Math.floor(voice.seconds / 60)}:${String(voice.seconds % 60).padStart(2, "0")}` })}
                </span>
                <button type="button" className="ai-paste__remove" aria-label={tx("Descartar áudio")} onClick={() => setVoice(null)}>
                  ×
                </button>
              </div>
            )}
            {images.map((im) => (
              <div key={im.id} className="ai-paste__chip">
                <span className="ai-paste__img">
                  <img src={im.url} alt={tx("Imagem colada")} />
                </span>
                <button type="button" className="ai-paste__remove" aria-label={tx("Remover imagem")} onClick={() => setImages((l) => l.filter((x) => x.id !== im.id))}>
                  ×
                </button>
              </div>
            ))}
            {pasted.map((p) => (
              <div key={p.id} className={`ai-paste__chip ${preview === p.id ? "is-open" : ""}`}>
                <button type="button" className="ai-paste__card" onClick={() => setPreview((v) => (v === p.id ? null : p.id))} title={tx("Ver texto colado")}>
                  <span className="ai-paste__mini" aria-hidden>
                    {p.text.slice(0, 220)}
                  </span>
                  <span className="ai-paste__meta">
                    {tx("📋 {kind} · {n} caracteres", {
                      kind: p.html ? tx("Colado com formatação") : tx("Texto colado"),
                      n: p.text.length.toLocaleString(tag),
                    })}
                  </span>
                </button>
                <button type="button" className="ai-paste__remove" aria-label={tx("Remover texto colado")} onClick={() => setPasted((l) => l.filter((x) => x.id !== p.id))}>
                  ×
                </button>
              </div>
            ))}
            {preview !== null && <pre className="ai-paste__preview">{pasted.find((p) => p.id === preview)?.text}</pre>}
          </div>
        )}
        <textarea
          ref={inputRef}
          className="ai-panel__input"
          rows={3}
          value={draft}
          placeholder={hasSelection ? tx("Pergunte ou peça uma mudança no trecho selecionado") : tx("Pergunte algo ou peça uma mudança — dá para colar texto ou imagens")}
          disabled={busy || !enabled}
          onChange={(e) => setDraft(e.target.value)}
          onPaste={(e) => {
            const files = [...e.clipboardData.files].filter((f) => IMAGE_TYPES.includes(f.type));
            if (files.length) {
              e.preventDefault();
              void addImages(files);
              return;
            }
            const audio = canTranscribe ? [...e.clipboardData.files].find((f) => AUDIO_TYPES.test(f.type)) : undefined;
            if (audio) {
              e.preventDefault();
              setVoice({ blob: audio, seconds: 0 });
              return;
            }
            const text = e.clipboardData.getData("text/plain").trim();
            // prefer the rich flavour: headings / lists / bold survive, flattened text doesn't
            const rawHtml = e.clipboardData.getData("text/html");
            const html = rawHtml ? cleanPastedHtml(editor, rawHtml) : null;
            const structured = !!html && BLOCK_TAGS.test(html);
            if (text.length < PASTE_CHIP_MIN && !structured) return;
            e.preventDefault();
            setPasted((l) => [...l, { id: nextId.current++, text: text || html!.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(), html: html ?? undefined }]);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void sendNow();
            }
            if (e.key === "Backspace" && !draft && (pasted.length || images.length || voice)) {
              e.preventDefault();
              if (voice) setVoice(null);
              else if (pasted.length) setPasted((l) => l.slice(0, -1));
              else setImages((l) => l.slice(0, -1));
            }
          }}
        />
        {voiceError && <p className="ai-panel__voice-error">⚠️ {voiceError}</p>}
        <div className="ai-panel__row">
          <span className="ai-panel__scope">
            {recording ? (
              <span className="ai-voice__live">
                <span className="ai-voice__dot" aria-hidden />
                <Waveform stream={recording} />
                <span className="ai-voice__clock">
                  {Math.floor(recordSeconds / 60)}:{String(recordSeconds % 60).padStart(2, "0")}
                </span>
              </span>
            ) : hasSelection ? (
              tx("🎯 trecho selecionado")
            ) : (
              tx("📄 documento inteiro")
            )}
          </span>
          {canTranscribe && CAN_RECORD && !busy && (
            <button
              type="button"
              className={`ai-voice ${recording ? "ai-voice--on" : ""}`}
              title={recording ? tx("Parar gravação") : tx("Gravar áudio")}
              aria-label={recording ? tx("Parar gravação") : tx("Gravar áudio")}
              aria-pressed={!!recording}
              disabled={!enabled}
              onClick={() => (recording ? void stopRecording() : void startRecording())}
            >
              {recording ? "■" : "🎤"}
            </button>
          )}
          {busy ? (
            <button type="button" className="button button--secondary ai-panel__send" onClick={() => abortRef.current?.abort()}>
              {tx("Parar")}
            </button>
          ) : recording ? (
            <button type="button" className="ai-voice ai-voice--send" title={tx("Enviar áudio")} aria-label={tx("Enviar áudio")} disabled={!enabled || !model} onClick={() => void sendNow()}>
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden fill="currentColor">
                <path d="M3.4 20.4 21.8 12 3.4 3.6l.1 6.6L15 12 3.5 13.8z" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              className="button button--primary ai-panel__send"
              disabled={(!draft.trim() && !pasted.length && !images.length && !voice) || !enabled || !model}
              onClick={() => void sendNow()}
            >
              {tx("Enviar")}
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
