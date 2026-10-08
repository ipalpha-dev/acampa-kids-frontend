import { api } from "./client";
import { bearer } from "../auth/store";

/**
 * The project's message templates (CONTRACTS_ACAMPA §11/§15, decisions 34/45):
 * every SMS / e-mail Acampa sends is a template of the IPAlpha project, sent
 * by notifications-api to a person id. The coordenação edits the copy here
 * (also editable in Oikos / the Developers portal); the variables are
 * fixed by Acampa's code.
 */

export const TEMPLATE_LANGS = ["pt-BR", "en-US", "es", "fr", "de"] as const;
export type TemplateLang = (typeof TEMPLATE_LANGS)[number];
export type LocalizedText = Partial<Record<TemplateLang, string>>;

/** SMS bodies are capped at 160 characters per language (decision 45). */
export const SMS_MAX = 160;

export interface MessageTemplate {
  slug: string;
  name: string;
  channel: "sms" | "email";
  variables: string[];
  subject: LocalizedText | null;
  body: LocalizedText;
  /** created in the project (else only Acampa's default copy exists yet) */
  live: boolean;
  version: number | null;
  /** the live copy differs from Acampa's default */
  customized: boolean;
  defaults: { body: LocalizedText; subject: LocalizedText | null } | null;
}

export interface TemplatePatch {
  name?: string;
  body?: LocalizedText;
  subject?: LocalizedText;
}

const json = (token: string) => ({ ...bearer(token), "content-type": "application/json" });

export async function listTemplates(token: string): Promise<MessageTemplate[]> {
  const res = await api<{ templates: MessageTemplate[] }>("/api/settings/message-templates", { headers: bearer(token) });
  return res.templates;
}

/** Creates every catalog template the project does not have yet. */
export function seedTemplates(token: string): Promise<{ created: number; total: number }> {
  return api("/api/settings/message-templates/seed", { method: "POST", headers: bearer(token) });
}

/** 400 TEMPLATE_INVALID when a rule fails (pt-BR required, known variables, SMS ≤ 160). */
export async function updateTemplate(token: string, slug: string, patch: TemplatePatch): Promise<MessageTemplate> {
  const res = await api<{ template: MessageTemplate }>(`/api/settings/message-templates/${encodeURIComponent(slug)}`, { method: "PATCH", headers: json(token), body: JSON.stringify(patch) });
  return res.template;
}

/** Back to Acampa's default copy. */
export async function resetTemplate(token: string, slug: string): Promise<MessageTemplate> {
  const res = await api<{ template: MessageTemplate }>(`/api/settings/message-templates/${encodeURIComponent(slug)}/reset`, { method: "POST", headers: bearer(token) });
  return res.template;
}

// ── the rules core enforces, checked while typing ─────────────────────────────

/** `{var}` placeholders used in a text. */
export function placeholdersOf(text: string): string[] {
  return [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))];
}

/** The SMS counter of one language: characters typed against the 160 cap. */
export function smsCounter(text: string): { length: number; max: number; left: number; over: boolean } {
  const length = [...text].length;
  return { length, max: SMS_MAX, left: SMS_MAX - length, over: length > SMS_MAX };
}

export interface TemplateDraft {
  channel: "sms" | "email";
  variables: string[];
  body: LocalizedText;
  subject: LocalizedText | null;
}

export type DraftProblem =
  | { kind: "ptRequired" }
  | { kind: "tooLong"; lang: TemplateLang; length: number }
  | { kind: "unknownVariable"; lang: TemplateLang; names: string[] };

/** Every problem of a draft (empty = it can be saved). Mirrors the backend's validateTemplate. */
export function draftProblems(d: TemplateDraft): DraftProblem[] {
  const out: DraftProblem[] = [];
  if (!d.body["pt-BR"]?.trim()) out.push({ kind: "ptRequired" });
  for (const lang of TEMPLATE_LANGS) {
    const texts = [d.body[lang] ?? "", d.subject?.[lang] ?? ""];
    const unknown = [...new Set(texts.flatMap(placeholdersOf))].filter((v) => !d.variables.includes(v));
    if (unknown.length) out.push({ kind: "unknownVariable", lang, names: unknown });
    if (d.channel === "sms") {
      const c = smsCounter(d.body[lang] ?? "");
      if (c.over) out.push({ kind: "tooLong", lang, length: c.length });
    }
  }
  return out;
}

/** Inserts `{name}` at the caret of a text (returns the new text and caret). */
export function insertVariable(text: string, name: string, start: number, end = start): { text: string; caret: number } {
  const token = `{${name}}`;
  const s = Math.max(0, Math.min(start, text.length));
  const e = Math.max(s, Math.min(end, text.length));
  return { text: text.slice(0, s) + token + text.slice(e), caret: s + token.length };
}
