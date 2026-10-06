import { api } from "./client";
import { bearer } from "../auth/store";

/**
 * People imports through IPAlpha (persons-api, CONTRACTS_ACAMPA §20 / §24).
 * The backend proxies core: the whole file goes to IPAlpha, which maps the
 * columns, matches people, extracts observations and applies in batches.
 * Acampa only declares its own app fields (room, transport, team…) and reads
 * back, per row, the person id + the app field values — never names or
 * contacts (names are resolved on screen with POST /api/people/names).
 * Decisions use persons-api's own shape: `{mapping?, reviews?: [{id, choice?,
 * value?, rows?}]}`. Coordenação only; only who started an import follows it.
 */

export type ImportSubject = "camper" | "team";
export type ImportStatus = "analysing" | "review" | "applying" | "done" | "failed" | "cancelled";
export type ReviewKind = "column" | "rowKind" | "invalid" | "match" | "duplicate" | "category" | "observations" | "required";

/** One field that lives on Acampa's side (filled from the sheet, returned per row). */
export interface AppField {
  key: string;
  description: string;
  kind: "text" | "category";
  categories?: { key: string; label: string }[];
  /** an empty value needs a decision before Apply (use a default, or don't import the row now) */
  required: boolean;
}

/** One question persons-api asks before applying (ids are stable; decisions survive a re-analysis). */
export interface ImportReview {
  id: string;
  kind: ReviewKind | string;
  /** must be decided before Apply */
  blocking: boolean;
  options: string[];
  rowRef: number | null;
  rowRefs: number[];
  /** a person field key, or `app:<key>` for Acampa's fields */
  field: string | null;
  /** match / invalid: whose data — the person, the responsible or the 2nd responsible */
  who: string | null;
  basis: string | null;
  /** match: the existing person (id only) */
  existingPersonId: string | null;
  /** duplicate: where the same person appears first */
  firstRowRef: number | null;
  choice: string | null;
  value: string | null;
  rows: Record<string, string> | null;
  resolved: boolean;
  /** the importer's own view of the file: the row's name, the original cell, the raw sheet value, how many rows */
  context: { name?: string; original?: string; value?: string; rows?: number };
}

export interface ImportStep {
  name: string;
  done: number;
  total: number;
}

export interface ImportCounts {
  rows: number;
  /** blocking questions still open — Apply stays locked while > 0 */
  pending: number;
  batches: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
}

export interface ImportView {
  id: string;
  subject: ImportSubject | null;
  status: ImportStatus;
  /** a failed apply resumes by applying again; `analysisFailed` is final */
  failureReason: string | null;
  steps: ImportStep[];
  file: { name: string; size: number; sheet: string | null } | null;
  /** sheet column → person field key / `app:<key>` (null = not imported) */
  mapping: Record<string, string | null>;
  /** what a column may map to */
  fields: string[];
  reviews: ImportReview[];
  appFields: AppField[];
  counts: ImportCounts;
  /** batches already written into Acampa */
  applied: { batches: number };
  createdAt: string | null;
  expiresAt: string | null;
}

export interface ReviewDecision {
  id: string;
  choice?: string;
  value?: string;
  rows?: Record<string, string>;
}

/** Only what changed is sent. */
export interface Decisions {
  mapping?: Record<string, string | null>;
  reviews?: ReviewDecision[];
}

export type ResultStatus = "created" | "updated" | "skipped" | "failed";

export interface ResultRow {
  rowRef: string;
  personId: string | null;
  status: ResultStatus;
  reason: string | null;
  appFields: Record<string, string>;
  /** app fields that stayed empty on this row */
  unfilled: string[];
}

export interface ResultBatch {
  batch: number;
  rows: ResultRow[];
}

/** Same limits the backend enforces (400 FILE_TOO_LARGE / FILE_TYPE_INVALID). */
export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const IMPORT_EXTENSIONS = [".csv", ".xlsx"];
export const APP_FIELD_PREFIX = "app:";

/** Gentle labels (pt-BR keys for `tx`) of Acampa's own fields; the backend's description is the fallback. */
export const APP_FIELD_LABEL: Record<string, string> = {
  transportation: "Transporte",
  bedroom: "Quarto",
  team: "Time",
  bedroomPreference: "Quer ficar com",
  invitedBy: "Convidado por",
  generalNotes: "Observações",
  roomRole: "Função no quarto",
};

export function isImportFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return IMPORT_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export async function fetchAppFields(token: string, subject: ImportSubject): Promise<AppField[]> {
  const res = await api<{ subject: ImportSubject; appFields: AppField[] }>(`/api/imports/app-fields?subject=${subject}`, { headers: bearer(token) });
  return res.appFields ?? [];
}

export async function createImport(token: string, subject: ImportSubject, file: File): Promise<ImportView> {
  const form = new FormData();
  form.append("file", file, file.name);
  form.append("subject", subject);
  const res = await api<{ import: ImportView }>("/api/imports", { method: "POST", headers: bearer(token), body: form });
  return res.import;
}

export async function fetchImport(token: string, id: string): Promise<ImportView> {
  const res = await api<{ import: ImportView }>(`/api/imports/${encodeURIComponent(id)}`, { headers: bearer(token), cache: "no-store" });
  return res.import;
}

export async function patchImport(token: string, id: string, decisions: Decisions): Promise<ImportView> {
  const res = await api<{ import: ImportView }>(`/api/imports/${encodeURIComponent(id)}`, { method: "PATCH", headers: bearer(token), body: JSON.stringify(decisions) });
  return res.import;
}

export async function applyImport(token: string, id: string): Promise<ImportView> {
  const res = await api<{ import: ImportView }>(`/api/imports/${encodeURIComponent(id)}/apply`, { method: "POST", headers: bearer(token) });
  return res.import;
}

export async function cancelImport(token: string, id: string): Promise<void> {
  await api<{ success: boolean }>(`/api/imports/${encodeURIComponent(id)}`, { method: "DELETE", headers: bearer(token) });
}

/** `cursor` = the first batch number to read (1-based); `nextCursor` null = no further batch yet. */
export async function fetchImportResults(token: string, id: string, cursor?: string | null): Promise<{ items: ResultBatch[]; nextCursor: string | null }> {
  const q = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const res = await api<{ items: ResultBatch[]; nextCursor: string | null }>(`/api/imports/${encodeURIComponent(id)}/results${q}`, { headers: bearer(token), cache: "no-store" });
  return { items: res.items ?? [], nextCursor: res.nextCursor ?? null };
}

// ── decision 78: import values a manual edit kept aside ─────────────────────

export interface ImportConflict {
  id: string;
  personId: string;
  /** transportation | bedroom | team | roomRole | bedroomPreference | invitedBy | generalNotes */
  field: string;
  importValue: string | null;
  currentValue: string | null;
  importId: string;
  createdAt: string;
}

export async function fetchImportConflicts(token: string, subject: ImportSubject): Promise<ImportConflict[]> {
  const res = await api<{ items: ImportConflict[] }>(`/api/import-conflicts?subject=${subject}`, { headers: bearer(token), cache: "no-store" });
  return res.items ?? [];
}

export async function resolveImportConflicts(token: string, ids: string[], choice: "import" | "keep"): Promise<{ applied: number; kept: number; failed: { id: string; code: string; message: string }[] }> {
  return api(`/api/import-conflicts/resolve`, { method: "POST", headers: bearer(token), body: JSON.stringify({ ids, choice }) });
}
