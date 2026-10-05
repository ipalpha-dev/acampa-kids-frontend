import { ApiError, api, command } from "./client";
import { bearer } from "../auth/store";

export type ImportField =
  | "name" | "birthDate" | "probableGender" | "bed" | "bedroomPreference" | "team" | "transportation" | "bedroom" | "leader"
  | "cpf" | "guardianCpf" | "rg" | "school" | "schoolGrade" | "church" | "invitedBy" | "guardianName"
  | "guardianPhone" | "guardianEmail" | "guardian2Name" | "guardian2Phone" | "emergencyContact" | "insurance" | "insuranceCard" | "weightKg"
  | "allergies" | "drugAllergies" | "healthIssues" | "neurodivergent" | "dailyMedication" | "foodRestrictions" | "healthNotes" | "generalNotes";

export interface ImportColumn {
  source: string;
  target: ImportField | null;
  confidence: number;
  samples: string[];
}

export type ImportReviewKind = "leader" | "date" | "guardianName" | "phone" | "cpf" | "email" | "duplicate";

export interface ImportReviewItem {
  id: string;
  row: number;
  kind: ImportReviewKind;
  field: string;
  kidName: string;
  guardianName: string;
  birthDate: string;
  age: number | null;
  emergencyContact: string;
  original: string;
  value: string;
  skip: boolean;
  resolved: boolean;
  affectedRows?: number[];
  options?: { id: string; label: string }[];
  existingId?: string;
  existingData?: Record<string, unknown>;
  incomingData?: Record<string, unknown>;
  mergedData?: Record<string, unknown>;
  mergeAvailable?: boolean;
}

export interface CamperImport {
  id: string;
  fileName: string;
  fileType: string;
  status: ImportJobStatus;
  dryRun: boolean;
  columns: ImportColumn[];
  dictionaries: { field: string; raw: string; normalized: string; value: unknown; label: string; draft: boolean; kind: string }[];
  reviews: ImportReviewItem[];
  preview: Record<string, unknown>[];
  skipped: Record<string, unknown>[];
  createdItems: { kind: string; id: string; label: string; draft: boolean }[];
  dateFunction: string;
  startedAt: string;
  finishedAt: string | null;
  error: string;
  /** the importer's IPAlpha sign-in ended while the AI health pass ran: paused until they sign in again (decision 50) */
  needsSignIn?: boolean;
  pausedAt?: string | null;
}

/** Job statuses of both import routers; `needsSignIn` = paused, waiting for the importer's new sign-in. */
export type ImportJobStatus = "needs_mapping" | "analyzing" | "panic" | "review" | "ready" | "importing" | "completed" | "error" | "needsSignIn";

/** One import I started that waits for my new sign-in (`GET …/needs-sign-in`). */
export interface PausedImport {
  id: string;
  fileName: string;
  pausedAt: string | null;
}

export async function listImportFields(token: string): Promise<{ key: ImportField; label: string }[]> {
  const res = await api<{ fields: { key: ImportField; label: string }[] }>("/api/camper-imports/fields", { headers: bearer(token) });
  return res.fields;
}

export async function analyzeCamperFile(token: string, file: File, mapping?: Record<string, string | null>, progressId?: string): Promise<CamperImport> {
  const data = new FormData();
  data.append("file", file);
  if (mapping) data.append("mapping", JSON.stringify(mapping));
  if (progressId) data.append("progress", progressId);
  const res = await api<{ import: CamperImport }>("/api/camper-imports/analyze", { method: "POST", headers: bearer(token), body: data });
  return res.import;
}

export async function createImportLeader(token: string, importId: string, reviewId: string, phone: string): Promise<{ staff: { id: string; name: string }; import: CamperImport }> {
  return command<{ staff: { id: string; name: string }; import: CamperImport }>(`/api/camper-imports/${importId}/leaders`, {
    method: "POST",
    headers: { ...bearer(token), "content-type": "application/json" },
    body: JSON.stringify({ reviewId, phone }),
  }, ["staff"]);
}

export async function applyCamperImport(token: string, importId: string, file: File, delta: Record<string, { value?: string; skip?: boolean }>, declinedCategoryIds: string[] = [], duplicateChoice:"update"|"keep"|"merge"|""=""): Promise<{ inserted: number; updated?: number; skipped: number; import: CamperImport }> {
  const data = new FormData();
  data.append("file", file);
  data.append("delta", JSON.stringify(delta));
  data.append("declinedCategoryIds", JSON.stringify(declinedCategoryIds));
  data.append("duplicateChoice",duplicateChoice);
  return command(`/api/camper-imports/${importId}/apply`, {
    method: "POST",
    headers: bearer(token),
    body: data,
  }, ["campers", "bedrooms", "staff", "teams", "transports", "categories"]);
}

export interface ImportPhaseInfo { key: string; pct: number }

/** live phase of a running analysis — the token was generated for the analyze request */
export async function getCamperImportProgress(tokenId: string, progressId: string): Promise<ImportPhaseInfo | null> {
  const res = await api<{ progress: ImportPhaseInfo | null }>(`/api/camper-imports/progress/${progressId}`, { headers: bearer(tokenId) });
  return res.progress;
}

/** The camper imports I started whose AI health pass waits for my new sign-in (decision 50). */
export async function listPausedCamperImports(token: string): Promise<PausedImport[]> {
  const res = await api<{ imports: PausedImport[] }>("/api/camper-imports/needs-sign-in", { headers: bearer(token), cache: "no-store" });
  return res.imports;
}

/** Resumes a paused camper import with my fresh coordenação sign-in (only the importer). */
export async function resumeCamperImport(token: string, id: string): Promise<CamperImport> {
  const res = await api<{ import: CamperImport }>(`/api/camper-imports/${encodeURIComponent(id)}/resume`, { method: "POST", headers: bearer(token) });
  return res.import;
}

/** Apply needs the coordenação role (it registers people in IPAlpha) — said gently, with the way forward. */
export function importErrorMessage(e: unknown, fallback: string, tx: (pt: string) => string): string {
  if (e instanceof ApiError && (e.code === "COORDINATION_REQUIRED" || e.code === "CORE_FORBIDDEN")) return tx("Só quem serve na coordenação pode gravar a importação no IPAlpha. Troque para o perfil de coordenação e tente de novo — nada foi perdido.");
  return e instanceof Error ? e.message : fallback;
}
