import { ApiError, OFFLINE_MESSAGE, api } from "./client";
import { bearer } from "../auth/store";

const BASE = import.meta.env.VITE_API_URL || window.location.origin;

export type AiVendor = "anthropic" | "openai" | "xai" | "meta" | "zhipu" | "google" | "alibaba" | "typesafe";

export interface AiModel {
  id: string;
  label: string;
  /** company logo shown beside the name */
  vendor?: AiVendor;
}

export interface AiMessage {
  role: "user" | "assistant";
  content: string;
}

export async function listAiModels(token: string): Promise<{ enabled: boolean; models: AiModel[]; transcribe?: boolean }> {
  return api("/api/ai/models", { headers: bearer(token) });
}

/** Voice message recorded in the chat → Portuguese text (whisper on the server). */
export async function aiTranscribe(token: string, audio: Blob, signal?: AbortSignal): Promise<string> {
  const form = new FormData();
  form.append("file", audio, "voice");
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/ai/transcribe`, { method: "POST", headers: bearer(token), body: form, signal });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err;
    throw new ApiError(0, "OFFLINE", OFFLINE_MESSAGE);
  }
  const data = (await res.json().catch(() => null)) as { text?: string; error?: { code?: string; message?: string } } | null;
  if (!res.ok) throw new ApiError(res.status, data?.error?.code ?? "AI_FAILED", data?.error?.message ?? "Não foi possível transcrever o áudio.");
  return data?.text ?? "";
}

export interface AiVendorUsage {
  vendor: AiVendor | string;
  calls: number;
  errors: number;
  promptTokens: number;
  completionTokens: number;
  lastAt: string | null;
  models: { model: string; calls: number; promptTokens: number; completionTokens: number }[];
}

export interface AiKindUsage {
  kind: string;
  calls: number;
  promptTokens: number;
  completionTokens: number;
}

export interface SmsUsage {
  sent: number;
  /** sent × R$ 0,095 (server-side rate) */
  costBrl: number;
  lastAt: string | null;
}

/** admin only: AI calls and tokens per company and per kind of request, plus the SMS counter */
export async function aiUsage(token: string): Promise<{ vendors: AiVendorUsage[]; kinds: AiKindUsage[]; sms?: SmsUsage }> {
  return api("/api/ai/usage", { headers: bearer(token) });
}

/** What the editor is being used for (matches AI_CONTEXTS on the backend). */
export type AiContext = "instruction" | "preparation" | "role_instructions" | "role_preparation" | "occurrence" | "event" | "category" | "generic";

export interface AiEditRequest {
  model: string;
  context?: AiContext;
  /** document title (context only) */
  title?: string;
  /** current document HTML (relative image urls) */
  html: string;
  /** selected fragment HTML, when the user is editing only a part */
  selection?: string | null;
  messages: AiMessage[];
  /** pictures pasted into the chat (data urls) — go with the last user message */
  images?: string[];
}

/** Lines starting with this in the stream are status notes ("consultando programação"), not model output. */
const TOOL_MARK = "\u241e";

/** the model wraps a new document version in these; everything outside is chat */
const DOC_OPEN = "<<<DOC>>>";
const DOC_CLOSE = "<<</DOC>>>";

export interface AiProgress {
  /** what the model says in the chat (never HTML) */
  reply: string;
  /** new document HTML, when the model decided to change the text; null = answer only */
  doc: string | null;
  /** the document block is still streaming (no closing marker yet) */
  docPending: boolean;
  /** what the model looked up so far, in order */
  lookups: string[];
  /** live reasoning to show while pending (model chatter + lookup steps) */
  thought: string[];
}

/**
 * Splits the raw stream into chat reply, document block, lookup notes and live
 * thought. Anything the model wrote BEFORE a lookup ("vou conferir o horário…")
 * is thinking out loud: it goes to `thought` for live display only.
 *
 * The model decides by itself whether to touch the document: when it does, the
 * new HTML arrives wrapped in <<<DOC>>> … <<</DOC>>> and everything outside the
 * markers is the message shown in the chat.
 */
export function parseAiStream(raw: string): AiProgress {
  const lookups: string[] = [];
  const thought: string[] = [];
  let out = "";
  for (const line of raw.split("\n")) {
    if (line.startsWith(TOOL_MARK)) {
      lookups.push(line.slice(TOOL_MARK.length));
      if (out.trim()) thought.push(out.trim().slice(0, 300));
      out = "";
    } else {
      out += (out ? "\n" : "") + line;
    }
  }
  const start = out.indexOf(DOC_OPEN);
  if (start === -1) return { reply: out.trim(), doc: null, docPending: false, lookups, thought };
  const after = start + DOC_OPEN.length;
  const end = out.indexOf(DOC_CLOSE, after);
  const docPending = end === -1;
  const doc = (docPending ? out.slice(after) : out.slice(after, end)).trim();
  const reply = (out.slice(0, start) + (docPending ? "" : out.slice(end + DOC_CLOSE.length))).trim();
  return { reply, doc, docPending, lookups, thought };
}

/** Streams the model output; resolves with the parsed reply (chat text + optional new document). */
export async function aiEdit(token: string, req: AiEditRequest, onChunk: (progress: AiProgress) => void, signal?: AbortSignal): Promise<AiProgress> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/ai/edit`, {
      method: "POST",
      headers: { ...bearer(token), "content-type": "application/json" },
      body: JSON.stringify(req),
      signal,
    });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err;
    throw new ApiError(0, "OFFLINE", OFFLINE_MESSAGE);
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
    throw new ApiError(res.status, data?.error?.code ?? "AI_FAILED", data?.error?.message ?? "O assistente não respondeu.");
  }
  if (!res.body) return { reply: "", doc: null, docPending: false, lookups: [], thought: [] };
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    onChunk(parseAiStream(text));
  }
  return parseAiStream(text);
}

/** how a generated illustration is framed */
export type AiImageShape = "square" | "wide" | "tall";

export interface AiImageModel {
  id: string;
  label: string;
  vendor?: AiVendor;
}

export interface AiGeneratedImage {
  /** data url of the rendered picture (shrink + upload before putting it in a document) */
  dataUrl: string;
  bytes: number;
  model: string;
  label: string;
  vendor?: AiVendor;
  ms: number;
}

export async function listAiImageModels(token: string): Promise<{ enabled: boolean; models: AiImageModel[] }> {
  return api("/api/ai/image-models", { headers: bearer(token) });
}

/** Renders an illustration for the document (slow: 10–60 s). */
export async function aiImage(
  token: string,
  req: { description: string; shape?: AiImageShape; model?: string; style?: boolean },
  signal?: AbortSignal,
): Promise<AiGeneratedImage> {
  return api("/api/ai/image", { method: "POST", headers: { ...bearer(token), "content-type": "application/json" }, body: JSON.stringify(req), signal });
}

export interface AiSuggestion {
  title?: string;
  emoji?: string;
}

/** Title / emoji suggestions from a title or document. Best-effort: may return {}. */
export async function aiSuggest(
  token: string,
  req: { html: string; context: AiContext; needTitle: boolean; needEmoji: boolean; emojiChoices?: string[] },
  signal?: AbortSignal,
): Promise<AiSuggestion> {
  return api("/api/ai/suggest", { method: "POST", headers: { ...bearer(token), "content-type": "application/json" }, body: JSON.stringify(req), signal });
}

/** the camper-form fields the notes sorter can fill (category option ids for the lists) */
export interface CamperNotesFields {
  allergies: string[];
  drugAllergies: string[];
  healthIssues: string[];
  neurodivergent: boolean;
  medications: { name: string; dose: string; times: string[]; asNeeded: boolean; notes: string }[];
  foodRestrictions: string;
  healthNotes: string;
  bedroomPreference: string;
  emergencyContact: string;
  weightKg: number | null;
  insurance: string;
  insuranceCard: string;
  /** the kid's own identity/registration fields (camper subject only) */
  cpf: string;
  rg: string;
  school: string;
  schoolGrade: string;
  church: string;
  invitedBy: string;
  /** the guardian block (camper subject only) */
  guardianName: string;
  guardianPhone: string;
  guardianCpf: string;
  guardianEmail: string;
  /** what stays in "Observações gerais" after sorting */
  generalNotes: string;
}

/** whose form is being sorted: "camper" = admin kid form, "parent" = parent's attention dialog, "staff" = team member form */
export type AiNotesSubject = "camper" | "parent" | "staff";

/**
 * Sorts the free-text observations pasted into a form into the right fields.
 * `current` is what the form already holds — the answer keeps it. Fields the
 * subject doesn't have come back blank.
 */
export async function aiCamperNotes(
  token: string,
  req: { notes: string; subject: AiNotesSubject; current: Partial<CamperNotesFields> },
  signal?: AbortSignal,
): Promise<{ fields: CamperNotesFields; model: string; vendor?: AiVendor }> {
  return api("/api/ai/camper-notes", { method: "POST", headers: { ...bearer(token), "content-type": "application/json" }, body: JSON.stringify(req), signal });
}

/** the free-text fields the background dedup pass may clean (must match the backend) */
export type DedupField = "emergencyContact" | "bedroomPreference" | "foodRestrictions" | "healthNotes" | "generalNotes";

/**
 * Removes entries repeated in ONE free-text field (the sorter sometimes echoes
 * a value it was told to keep). Best-effort background call: on any failure the
 * server returns the value unchanged, so the caller can ignore errors.
 */
export async function aiDedupField(token: string, field: DedupField, value: string, signal?: AbortSignal): Promise<{ value: string; changed: boolean }> {
  return api("/api/ai/dedup-field", { method: "POST", headers: { ...bearer(token), "content-type": "application/json" }, body: JSON.stringify({ field, value }), signal });
}


/** Models sometimes wrap the answer in ```html fences even when told not to. */
export function stripCodeFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:html)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}
