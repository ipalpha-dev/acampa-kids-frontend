import { useEffect, useMemo, useSyncExternalStore } from "react";
import { api } from "../api/client";
import { bearer, loadAuth } from "../auth/store";

/**
 * Live names of the people the viewer may know (CONTRACTS_ACAMPA §15/§16).
 *
 * Camp-ops records only carry person ids; the name, nickname and sex (decision
 * 39 — shown like the name) are read from IPAlpha when displayed: a screen
 * that lists kids / team pages its list on demand (./roster.ts), and
 * `POST /api/people/names` (≤ 200 per call) resolves any other id on screen. In memory only — on the device it survives solely inside
 * the encrypted offline copy (./offline.ts).
 */
export interface PersonInfo {
  personId: string;
  name: string;
  nickname: string | null;
  sex: "F" | "M" | null;
  /** neutral ♥ (roles allowed health only): there is health information — never what it is */
  hasHealth?: boolean;
}

export const NAMES_BATCH_MAX = 200;

let people = new Map<string, PersonInfo>();
let version = 0;
/** bumps whenever the cache is emptied (logout, role / camp switch): per-scope name work starts over */
let epoch = 0;
const listeners = new Set<() => void>();
const changeHooks = new Set<() => void>();

function emit() {
  version++;
  for (const l of listeners) l();
  for (const h of changeHooks) h();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The store persists the cache with the offline copy. */
export function onPeopleChange(hook: () => void): () => void {
  changeHooks.add(hook);
  return () => changeHooks.delete(hook);
}

/** Adds / refreshes people (a list page, a names answer, the offline copy). */
export function rememberPeople(items: readonly Partial<PersonInfo>[]): void {
  let changed = false;
  for (const it of items) {
    if (!it?.personId) continue;
    const prev = people.get(it.personId);
    const next: PersonInfo = {
      personId: it.personId,
      name: it.name ?? prev?.name ?? "",
      nickname: it.nickname !== undefined ? it.nickname : (prev?.nickname ?? null),
      sex: it.sex !== undefined ? it.sex : (prev?.sex ?? null),
      ...(it.hasHealth !== undefined ? { hasHealth: it.hasHealth } : prev?.hasHealth !== undefined ? { hasHealth: prev.hasHealth } : {}),
    };
    if (prev && prev.name === next.name && prev.nickname === next.nickname && prev.sex === next.sex && prev.hasHealth === next.hasHealth) continue;
    if (!changed) people = new Map(people);
    people.set(it.personId, next);
    changed = true;
  }
  if (changed) emit();
}

export function personInfo(id: string | null | undefined): PersonInfo | null {
  return id ? (people.get(id) ?? null) : null;
}

export function peopleSnapshot(): PersonInfo[] {
  return [...people.values()];
}

export function clearPeople(): void {
  epoch++;
  pending.clear();
  inflight.clear();
  unknown.clear();
  if (people.size === 0) return;
  people = new Map();
  emit();
}

export function peopleVersion(): number {
  return version;
}

/** Changes every time the cache is emptied — a new session scope. */
export function peopleEpoch(): number {
  return epoch;
}

export function usePeopleVersion(): number {
  return useSyncExternalStore(subscribe, () => version);
}

// ── POST /api/people/names, batched ──────────────────────────────────────────

const pending = new Set<string>();
const inflight = new Set<string>();
/** ids the server answered without a name (not the viewer's to know): not asked again in this scope */
const unknown = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/** Asks for the names of ids not known yet (coalesced, ≤ 200 per call). Unknown / not allowed ids simply stay unnamed. */
export function requestNames(ids: readonly (string | null | undefined)[]): void {
  for (const id of ids) if (id && !people.has(id) && !inflight.has(id) && !unknown.has(id)) pending.add(id);
  if (pending.size === 0 || flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushNames();
  }, 30);
}

async function flushNames(): Promise<void> {
  const token = loadAuth()?.token;
  const ids = [...pending];
  pending.clear();
  if (!token || ids.length === 0) return;
  for (const id of ids) inflight.add(id);
  for (let i = 0; i < ids.length; i += NAMES_BATCH_MAX) {
    const batch = ids.slice(i, i + NAMES_BATCH_MAX);
    try {
      const scope = epoch;
      const res = await api<{ items: PersonInfo[] }>("/api/people/names", { method: "POST", headers: bearer(token), body: JSON.stringify({ personIds: batch }) });
      if (scope !== epoch) continue;
      rememberPeople(res.items);
      const named = new Set(res.items.map((it) => it.personId));
      for (const id of batch) if (!named.has(id)) unknown.add(id);
    } catch {
      // offline / server trouble: the screen keeps its placeholder and asks again later
    } finally {
      for (const id of batch) inflight.delete(id);
    }
  }
}

/** The name of one person (requested on demand); "" while unknown. */
export function usePersonName(id: string | null | undefined): string {
  usePeopleVersion();
  useEffect(() => {
    if (id) requestNames([id]);
  }, [id]);
  return personInfo(id)?.name ?? "";
}

/** Resolves a set of ids on screen; returns a lookup (re-renders as names arrive). */
export function useNames(ids: readonly (string | null | undefined)[]): (id: string | null | undefined) => string {
  const v = usePeopleVersion();
  const key = ids.filter(Boolean).join(",");
  useEffect(() => {
    requestNames(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (id: string | null | undefined) => personInfo(id)?.name ?? "", [v]);
}

/** Resolves names right now (awaits the missing ones); unknown ids are left out. */
export async function namesFor(ids: readonly string[]): Promise<string[]> {
  const missing = ids.filter((id) => !people.has(id));
  if (missing.length) {
    for (const id of missing) pending.add(id);
    await flushNames();
  }
  return ids.map((id) => people.get(id)?.name ?? "").filter(Boolean);
}
