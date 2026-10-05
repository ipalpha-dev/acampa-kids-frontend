import { api } from "./client";
import { bearer } from "../auth/store";

/**
 * People imports through IPAlpha (persons-api, CONTRACTS_ACAMPA §20 / §24).
 * The backend proxies core: the whole file goes to IPAlpha, which maps the
 * columns, matches people, extracts observations and applies in batches.
 * Acampa only declares its own app fields (room, transport, team…) and reads
 * back, per row, the person id + the app field values — never names or
 * contacts (names are resolved on screen with POST /api/people/names).
 * Coordenação only.
 */

export type ImportSubject = "camper" | "team";
export type ImportStatus = "analysing" | "review" | "applying" | "done" | "failed" | "cancelled";
export type ReviewChoice = "match" | "new" | "skip";
export type RequiredDecision = { mode: "default"; value: string } | { mode: "skip" };

/** One field that lives on Acampa's side (filled from the sheet, returned per row). */
export interface AppField {
  key: string;
  description: string;
  kind: "text" | "category";
  categories?: { key: string; label: string }[];
  /** an empty value needs a decision before Apply (use a default, or don't import the row now) */
  required: boolean;
}

export interface ImportAppField extends AppField {
  /** sheet value → category key (null = leave blank) */
  categoryMapping: Record<string, string | null>;
  /** rows where this field came out empty */
  emptyRows: number;
  decision: RequiredDecision | null;
}

export interface ImportReview {
  id: string;
  rowRef: string;
  kind: string;
  message: string;
  candidates: { personId: string }[];
  choice: ReviewChoice | null;
  personId: string | null;
}

export interface ImportStep {
  name: string;
  done: number;
  total: number;
}

export interface ImportView {
  id: string;
  subject: ImportSubject | null;
  status: ImportStatus;
  steps: ImportStep[];
  file: { name: string; size: number; sheet: string } | null;
  /** sheet column → person field key core maps it to (null = not imported) */
  mapping: Record<string, string | null>;
  /** person fields core can map a column to (may be empty) */
  fields: { key: string; label: string }[];
  reviews: ImportReview[];
  appFields: ImportAppField[];
  /** required app fields still waiting for a decision — Apply stays locked while any is here */
  pendingRequired: string[];
  counts: { rows: number; created: number; updated: number; skipped: number; failed: number };
  applied: { batches: number; rows: number };
  createdAt: string | null;
  expiresAt: string | null;
}

/** Only what changed is sent. */
export interface Decisions {
  mapping?: Record<string, string | null>;
  reviews?: Record<string, { choice: ReviewChoice; personId?: string }>;
  categories?: Record<string, Record<string, string | null>>;
  required?: Record<string, RequiredDecision>;
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

export async function fetchImportResults(token: string, id: string, cursor?: string | null): Promise<{ items: ResultBatch[]; nextCursor: string | null }> {
  const q = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const res = await api<{ items: ResultBatch[]; nextCursor: string | null }>(`/api/imports/${encodeURIComponent(id)}/results${q}`, { headers: bearer(token), cache: "no-store" });
  return { items: res.items ?? [], nextCursor: res.nextCursor ?? null };
}
