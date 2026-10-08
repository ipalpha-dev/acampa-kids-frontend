import { api } from "./client";
import { bearer } from "../auth/store";

/** One camp's counts, as the Superusuário page's Acampamentos card shows them. */
export interface CampCounts {
  campers: number;
  staff: number;
  photos: number;
}

/** A camp in the registry (Superusuário → Acampamentos). */
export interface CampRow {
  id: string;
  label: string;
  year: number;
  active: boolean;
  archivedAt: string | null;
  counts: CampCounts;
  canEnter: boolean;
}

/** Admin / active-camp organizer: every camp with its counts. */
export async function fetchCamps(token: string): Promise<CampRow[]> {
  const res = await api<{ camps: CampRow[] }>("/api/camps", { headers: bearer(token) });
  return res.camps;
}

/** Public: the active camp's label, for the login screen. */
export async function fetchActiveCamp(): Promise<{ id: string; label: string; year: number }> {
  return api("/api/camps/active");
}

/** Admin / super: creates a camp and makes it active (the previous active is archived). */
export async function createCamp(token: string, input: { label: string; year: number }): Promise<{ id: string; label: string; year: number; active: boolean; archivedAt: string | null }> {
  const res = await api<{ camp: { id: string; label: string; year: number; active: boolean; archivedAt: string | null } }>("/api/camps", {
    method: "POST",
    headers: bearer(token),
    body: JSON.stringify(input),
  });
  return res.camp;
}

export interface UpdateCampInput {
  label?: string;
  year?: number;
  active?: true;
  archived?: boolean;
}

/** Admin / super: rename, re-year, activate or archive a camp. */
export async function updateCamp(token: string, id: string, input: UpdateCampInput): Promise<{ id: string; label: string; year: number; active: boolean; archivedAt: string | null }> {
  const res = await api<{ camp: { id: string; label: string; year: number; active: boolean; archivedAt: string | null } }>(`/api/camps/${id}`, {
    method: "PUT",
    headers: bearer(token),
    body: JSON.stringify(input),
  });
  return res.camp;
}

/** Super admin: sends a 6-digit SMS code to the caller's own phone (as IPAlpha knows it — never answered) before a camp can be deleted. Never the active camp. */
export async function requestCampDelete(token: string, id: string): Promise<{ success: boolean; expiresAt: string; delivery: "sms" }> {
  return api(`/api/camps/${id}/delete/request`, { method: "POST", headers: bearer(token) });
}

/** Super admin: confirms the SMS code and permanently deletes the camp and everything scoped to it. */
export async function confirmCampDelete(token: string, id: string, code: string): Promise<{ success: boolean; removed: number }> {
  return api(`/api/camps/${id}/delete/confirm`, {
    method: "POST",
    headers: bearer(token),
    body: JSON.stringify({ code }),
  });
}

/** A block the cross-year import can copy. */
export type CampImportBlock = "categories" | "teams" | "bedrooms" | "transports" | "staff" | "campers" | "schedule" | "docs" | "settings";

/** Per-block counts of another camp, for the wizard's "Outros anos" step. */
export interface CampSummaryCounts {
  categories: number;
  teams: number;
  bedrooms: number;
  transports: number;
  staff: number;
  campers: number;
  schedule: number;
  docs: number;
  settings: number;
  roles: number;
  events: number;
  instructions: number;
  prepSections: number;
}

export interface CampImportSummary {
  camp: { id: string; label: string; year: number };
  counts: CampSummaryCounts;
}

/** Manager: how much another camp (year) has, block by block. */
export async function fetchCampSummary(token: string, id: string): Promise<CampImportSummary> {
  return api(`/api/camps/${id}/summary`, { headers: bearer(token) });
}

/** A camper row from ANOTHER year, as the cross-year import search shows it — name + sex live, no health. */
export interface CampCamperRow {
  id: string;
  name: string;
  sex: "F" | "M" | null;
  bedroom: string | null;
  team: string | null;
  /** someone soft-matching already exists in this year */
  matched: boolean;
}

/** A staff row from ANOTHER year, as the cross-year import search shows it. */
export interface CampStaffRow {
  id: string;
  name: string;
  roomRole: "caretaker" | "helper" | null;
  bedroom: string | null;
  team: string | null;
  /** someone soft-matching already exists in this year */
  matched: boolean;
}

/** Manager: searches another camp's campers by name (max 50). */
export async function searchCampCampers(token: string, id: string, q: string): Promise<CampCamperRow[]> {
  const res = await api<{ rows: CampCamperRow[] }>(`/api/camps/${id}/campers${q ? `?q=${encodeURIComponent(q)}` : ""}`, { headers: bearer(token) });
  return res.rows;
}

/** Manager: searches another camp's staff by name (max 50). */
export async function searchCampStaff(token: string, id: string, q: string): Promise<CampStaffRow[]> {
  const res = await api<{ rows: CampStaffRow[] }>(`/api/camps/${id}/staff${q ? `?q=${encodeURIComponent(q)}` : ""}`, { headers: bearer(token) });
  return res.rows;
}

export interface ImportFromCampInput {
  blocks?: CampImportBlock[];
  camperIds?: string[];
  staffIds?: string[];
  withRoles?: boolean;
  withAssignments?: boolean;
  onMatch?: "skip" | "update";
}

export interface ImportBlockResult {
  created: number;
  updated: number;
  skipped: number;
  /** people copied whose membership in this edition IPAlpha refused (granted later in Oikos) */
  membershipsFailed?: number;
}

export type ImportFromCampResult = Partial<Record<CampImportBlock, ImportBlockResult>>;

/** Manager, session camp must be the active one: copies blocks (or specific people) from another year into this one. */
export async function importFromCamp(token: string, id: string, input: ImportFromCampInput): Promise<ImportFromCampResult> {
  const res = await api<{ result: ImportFromCampResult }>(`/api/camps/${id}/import`, {
    method: "POST",
    headers: bearer(token),
    body: JSON.stringify(input),
  });
  return res.result;
}
