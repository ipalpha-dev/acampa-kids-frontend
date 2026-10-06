import { api } from "./client";
import { bearer } from "../auth/store";
import type { CamperRecord, HealthInfo, PersonLive } from "./campers";
import type { StaffRecord } from "./staff";

/**
 * Person data AT USE (CONTRACTS_ACAMPA §15/§16): names come with the paged
 * lists, everything else is read per person when a screen needs it and never
 * stored (only the encrypted, role-scoped offline copy keeps what was seen).
 */

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  total?: number;
}

/** Page size of the background list paging (the backend caps at 200). */
export const PAGE_LIMIT = 200;
/** A name filter at or under this many matches shows the health details (decision 31). */
export const HEALTH_DETAIL_MAX = 6;

export type CamperListItem = CamperRecord & PersonLive;
export type StaffListItem = StaffRecord & PersonLive;

function query(params: Record<string, string | number | boolean | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}

/**
 * `GET /api/campers` — one page of the kids the viewer may see (+ name, nickname, sex,
 * ♥ for health-allowed roles). `health` details only with a `tag` filter
 * (`allergies:<optionId>`, `medications`…) or a `q` that narrows to ≤ 6 kids.
 */
export function fetchCampersPage(token: string, opts: { cursor?: string | null; limit?: number; bedroom?: string; q?: string; tag?: string } = {}): Promise<Page<CamperListItem>> {
  return api<Page<CamperListItem>>(`/api/campers${query({ cursor: opts.cursor, limit: opts.limit ?? PAGE_LIMIT, bedroom: opts.bedroom, q: opts.q, tag: opts.tag })}`, { headers: bearer(token) });
}

/** `GET /api/staff` — one page of the team the viewer may see (+ name, nickname, sex, ♥ for managers). */
export function fetchStaffPage(token: string, opts: { cursor?: string | null; limit?: number; active?: boolean; q?: string } = {}): Promise<Page<StaffListItem>> {
  return api<Page<StaffListItem>>(`/api/staff${query({ cursor: opts.cursor, limit: opts.limit ?? PAGE_LIMIT, active: opts.active, q: opts.q })}`, { headers: bearer(token) });
}

/** Anonymized chip counts of the health filter (count endpoint — not logged, decision 22). */
export interface HealthCounts {
  total: number;
  /** tag → people with it (`allergies:<id>`, `medications`, `neurodivergent`, `foodRestrictions`…) */
  byTag: Record<string, number>;
}

export function fetchHealthCounts(token: string, tags: string[]): Promise<HealthCounts> {
  return api<HealthCounts>(`/api/campers/health-counts${query({ tags: tags.join(",") })}`, { headers: bearer(token) });
}

/** The church health option lists (persons-api): labels of allergies / conditions. */
export interface HealthList {
  key: "alergias" | "alergia-medicamentos" | "condicao-cronica" | string;
  options: { id: string; label: Record<string, string> | string; order: number; active: boolean }[];
}

export async function fetchHealthLists(token: string): Promise<HealthList[]> {
  const res = await api<{ lists: HealthList[] }>("/api/people/health-lists", { headers: bearer(token) });
  return res.lists;
}

/** Data kinds a role may read per person (persons-api role rules decide; each read is logged for the person). */
export type PersonDataKind = "phone" | "email" | "document" | "address" | "medical" | "school" | "emergencyContact" | "churchRelationship";

export interface EmergencyContact {
  name: string;
  phone: string;
  relation?: string;
}

/** persons-api answers contacts as lists (`[{e164}]`, `[{address}]`); older shapes are tolerated. */
type ContactAnswer = string | Record<string, unknown> | Record<string, unknown>[] | null;

export interface PersonDataMap {
  phone: ContactAnswer;
  email: ContactAnswer;
  document: { cpf?: string; rg?: string; [k: string]: unknown } | string | null;
  address: Record<string, unknown> | null;
  medical: HealthInfo | null;
  school: { name: string; grade: string } | null;
  emergencyContact: EmergencyContact | null;
  churchRelationship: Record<string, unknown> | null;
}

/** `GET /api/people/:personId/data/:kind` with the acting role token — never cached. */
export async function fetchPersonData<K extends PersonDataKind>(token: string, personId: string, kind: K): Promise<PersonDataMap[K]> {
  const res = await api<{ data: PersonDataMap[K] }>(`/api/people/${encodeURIComponent(personId)}/data/${kind}`, { headers: bearer(token), cache: "no-store" });
  return res.data ?? null;
}

/** `PATCH /api/people/:personId/data/:kind` (managers; core's role rules decide). */
export async function patchPersonData<K extends PersonDataKind>(token: string, personId: string, kind: K, body: unknown): Promise<PersonDataMap[K]> {
  const res = await api<{ data: PersonDataMap[K] }>(`/api/people/${encodeURIComponent(personId)}/data/${kind}`, { method: "PATCH", headers: { ...bearer(token), "content-type": "application/json" }, body: JSON.stringify(body) });
  return res.data ?? null;
}

function firstContact(data: ContactAnswer, keys: string[]): string | null {
  if (!data) return null;
  if (typeof data === "string") return data || null;
  const list = Array.isArray(data) ? data : [data];
  for (const item of list) {
    if (typeof item === "string") return item;
    for (const k of keys) {
      const v = (item as Record<string, unknown>)[k];
      if (typeof v === "string" && v) return v;
      if (Array.isArray(v)) {
        const nested = firstContact(v as Record<string, unknown>[], keys);
        if (nested) return nested;
      }
    }
  }
  return null;
}

/** A phone answer of persons-api → the first E.164 number, or null. */
export function phoneOf(data: PersonDataMap["phone"]): string | null {
  return firstContact(data, ["e164", "phone", "phones"]);
}

/** An e-mail answer of persons-api → the first address, or null. */
export function emailOf(data: PersonDataMap["email"]): string | null {
  return firstContact(data, ["address", "email", "emails"]);
}

/** Project members to add to the camp (coordenação / organização). */
export function searchPeople(token: string, role: "participante" | "equipe" | "responsavel", q: string, cursor?: string | null): Promise<Page<{ personId: string; name: string; nickname: string | null; sex: "F" | "M" | null }>> {
  return api(`/api/people/search${query({ role, q, cursor })}`, { headers: bearer(token) });
}
