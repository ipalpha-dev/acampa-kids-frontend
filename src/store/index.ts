import { useSyncExternalStore } from "react";
import type { Bedroom } from "../api/bedrooms";
import type { Camper } from "../api/campers";
import type { Category } from "../api/categories";
import type { Transport } from "../api/transports";
import type { Instruction } from "../api/instructions";
import type { Occurrence } from "../api/occurrences";
import type { MedicationDose } from "../api/medications";
import type { PrepSection } from "../api/preparation";
import type { CampEvent, ScheduleRole } from "../api/schedule";
import type { Staff } from "../api/staff";
import type { Settings } from "../api/settings";
import type { Team } from "../api/teams";
import type { ScoreEntry } from "../api/scores";
import type { GalleryPhoto } from "../api/gallery";
import { fetchOfflineKey, type OfflineKeyAnswer } from "../auth/store";
import { copyIsUsable, decryptJson, defaultBackend, encryptJson, importOfflineKey, stripHealth, type OfflineBackend } from "./offline";
import { clearPeople, onPeopleChange, peopleSnapshot, rememberPeople, type PersonInfo } from "./people";

/**
 * Local-first data store.
 *
 * Every collection the app reads lives here, in memory, so the app keeps
 * working with no network at the camp site. The server pushes the data over a
 * WebSocket (see ./realtime.ts): a full snapshot on connect and an update after
 * every change. Writes go through the REST API; their result is confirmed by
 * the server's push. Records carry camp operations only — names come from the
 * people cache (./people.ts), health and contacts are read per person on demand.
 *
 * On the device the state survives ONLY as the encrypted, role-scoped offline
 * copy (./offline.ts, decision 35) — never in localStorage.
 */

export interface Collections {
  campers: Camper[];
  staff: Staff[];
  bedrooms: Bedroom[];
  categories: Category[];
  transports: Transport[];
  teams: Team[];
  scores: ScoreEntry[];
  roles: ScheduleRole[];
  events: CampEvent[];
  preparation: PrepSection[];
  instructions: Instruction[];
  occurrences: Occurrence[];
  /** the medical team's checklist: one record per dose given */
  medications: MedicationDose[];
  gallery: GalleryPhoto[];
  settings: Settings;
}
export type CollectionName = keyof Collections;
type ListCollectionName = Exclude<CollectionName, "settings">;
export const COLLECTION_NAMES: CollectionName[] = ["campers", "staff", "bedrooms", "categories", "transports", "teams", "scores", "roles", "events", "preparation", "instructions", "occurrences", "medications", "gallery", "settings"];

export type ConnectionState = "connecting" | "online" | "offline";

interface StoreState {
  data: Partial<Collections>;
  /** ISO time of the last message from the server (null = never synced on this device) */
  syncedAt: string | null;
  connection: ConnectionState;
}

// the old plain-text roster snapshot (before the encrypted copy): never read, always removed
try {
  localStorage.removeItem("acampa.data.v1");
  localStorage.removeItem("acampa.data.meta");
} catch {
  // storage unavailable: nothing to remove
}

let state: StoreState = { data: {}, syncedAt: null, connection: "connecting" };
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

// ── encrypted offline copy ────────────────────────────────────────────────────

let backend: OfflineBackend = defaultBackend();
/** in memory only — dies with the session, the role / camp switch, the tab */
let offlineKey: CryptoKey | null = null;
let offlineInfo: { role: string; campId: string; healthAllowed: boolean; sessionExpiresAt: string; campEndsAt: string | null } | null = null;
/** bumps on every start / end so a late key answer never revives a wiped copy */
let offlineEpoch = 0;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let expiryTimer: ReturnType<typeof setTimeout> | null = null;
const MAX_TIMEOUT = 2 ** 31 - 1;

interface OfflinePayload {
  data: Partial<Collections>;
  syncedAt: string | null;
  people: PersonInfo[];
}

/** Tests only: swap the IndexedDB backend for an in-memory one. */
export function setOfflineBackend(next: OfflineBackend): void {
  backend = next;
}

function persist() {
  // coalesce bursts of writes into one encrypted write; nothing is written without the session key
  if (persistTimer || !offlineKey) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void writeCopy();
  }, 250);
}

async function writeCopy(): Promise<void> {
  const key = offlineKey;
  const info = offlineInfo;
  const epoch = offlineEpoch;
  if (!key || !info) return;
  const payload: OfflinePayload = { data: state.data, syncedAt: state.syncedAt, people: peopleSnapshot() };
  const safe = info.healthAllowed ? payload : { ...payload, data: stripHealth(payload.data as Record<string, unknown>) as Partial<Collections>, people: stripHealth({ people: payload.people }).people };
  try {
    const { iv, data } = await encryptJson(key, safe);
    if (epoch !== offlineEpoch) return;
    await backend.write({ iv, data, meta: { role: info.role, campId: info.campId, sessionExpiresAt: info.sessionExpiresAt, campEndsAt: info.campEndsAt, savedAt: new Date().toISOString() } });
  } catch (err) {
    console.warn("store: could not save the offline copy", err);
  }
}

function scheduleExpiry() {
  if (expiryTimer) clearTimeout(expiryTimer);
  expiryTimer = null;
  if (!offlineInfo) return;
  const ends = [offlineInfo.sessionExpiresAt, offlineInfo.campEndsAt].filter((x): x is string => !!x).map((x) => new Date(x).getTime());
  if (ends.length === 0) return;
  const at = Math.min(...ends);
  const epoch = offlineEpoch;
  // the camp is over / the session expired: the copy goes, even while the app is open
  expiryTimer = setTimeout(() => {
    if (epoch === offlineEpoch) void endOfflineSession();
  }, Math.max(0, Math.min(at - Date.now(), MAX_TIMEOUT)));
}

/**
 * Opens the offline copy of this session scope: asks the server for the
 * session key, reads back a usable copy (same role + camp, session not
 * expired, camp not over) and keeps encrypting what arrives from now on.
 * Anything else stored is wiped. Without network the key can't be fetched:
 * the copy stays sealed (and the app works from memory until it reconnects).
 */
export async function startOfflineSession(token: string, campId: string): Promise<void> {
  const epoch = ++offlineEpoch;
  offlineKey = null;
  offlineInfo = null;
  let answer: OfflineKeyAnswer;
  try {
    answer = await fetchOfflineKey(token);
  } catch {
    return;
  }
  if (epoch !== offlineEpoch) return;
  let key: CryptoKey;
  try {
    key = await importOfflineKey(answer.key);
  } catch {
    return;
  }
  if (epoch !== offlineEpoch) return;
  const info = { role: answer.role, campId, healthAllowed: answer.healthAllowed, sessionExpiresAt: answer.sessionExpiresAt, campEndsAt: answer.campEndsAt };
  const record = await backend.read();
  if (epoch !== offlineEpoch) return;
  if (record) {
    const payload = copyIsUsable(record.meta, info) ? await decryptJson<OfflinePayload>(key, record.iv, record.data) : null;
    if (epoch !== offlineEpoch) return;
    if (!payload) await backend.wipe();
    // the live feed may already be fresher than the copy: the copy only fills what is missing
    else if (!state.syncedAt || (payload.syncedAt && payload.syncedAt > state.syncedAt)) {
      rememberPeople(payload.people ?? []);
      state = { ...state, data: { ...payload.data, ...state.data }, syncedAt: state.syncedAt ?? payload.syncedAt };
      emit();
    }
  }
  if (info.campEndsAt && new Date(info.campEndsAt).getTime() <= Date.now()) {
    // the camp is over: nothing is kept on the device any more
    await backend.wipe();
    return;
  }
  offlineKey = key;
  offlineInfo = info;
  scheduleExpiry();
  persist();
}

/**
 * Logout, role / camp switch, 401, session end, camp end: forgets the key,
 * empties the in-memory store and deletes the encrypted copy.
 */
export async function endOfflineSession(): Promise<void> {
  offlineEpoch++;
  offlineKey = null;
  offlineInfo = null;
  if (expiryTimer) clearTimeout(expiryTimer);
  expiryTimer = null;
  clearStore();
  await backend.wipe();
}

/** Is an offline key active right now (tests / diagnostics)? */
export function offlineCopyActive(): boolean {
  return offlineKey !== null;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function getState(): StoreState {
  return state;
}

/** Replace whole collections (what the server pushes). */
export function applyServerData(data: Partial<Collections>, at: string): void {
  state = { ...state, data: { ...state.data, ...data }, syncedAt: at };
  persist();
  emit();
}

export function setConnection(connection: ConnectionState): void {
  if (state.connection === connection) return;
  state = { ...state, connection };
  emit();
}

/** Optimistic local edit of one collection (after a successful REST write). */
export function patchCollection<K extends ListCollectionName>(name: K, fn: (list: Collections[K]) => Collections[K]): void {
  const current = (state.data[name] ?? []) as Collections[K];
  state = { ...state, data: { ...state.data, [name]: fn(current) } };
  persist();
  emit();
}

/** Upsert one item by id. */
export function upsert<K extends ListCollectionName>(name: K, item: Collections[K][number]): void {
  patchCollection(name, (list) => {
    const i = list.findIndex((x) => x.id === item.id);
    const next = list.slice() as Collections[K];
    if (i < 0) next.push(item as never);
    else next[i] = item as never;
    return next;
  });
}

export function remove<K extends ListCollectionName>(name: K, id: string): void {
  patchCollection(name, (list) => list.filter((x) => x.id !== id) as Collections[K]);
}

/** Empties the in-memory store (and the people cache). The encrypted copy is handled by `endOfflineSession`. */
export function clearStore(): void {
  // drop any write still coalescing, or it would resurrect the data after the wipe
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  state = { data: {}, syncedAt: null, connection: "offline" };
  clearPeople();
  emit();
}

// ── hooks ───────────────────────────────────────────────────────────────────

const EMPTY: never[] = [];

/** One collection, or `null` while this device has never received it. */
export function useCollection<K extends CollectionName>(name: K): Collections[K] | null {
  return useSyncExternalStore(subscribe, () => (state.data[name] as Collections[K] | undefined) ?? null);
}

/** Same, but never null (empty list until synced). */
export function useCollectionOrEmpty<K extends CollectionName>(name: K): Collections[K] {
  return useSyncExternalStore(subscribe, () => ((state.data[name] as Collections[K] | undefined) ?? (EMPTY as unknown as Collections[K])));
}

export function useConnection(): ConnectionState {
  return useSyncExternalStore(subscribe, () => state.connection);
}

export function useSyncedAt(): string | null {
  return useSyncExternalStore(subscribe, () => state.syncedAt);
}

/** True once every collection has been received at least once. */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => COLLECTION_NAMES.every((n) => state.data[n] !== undefined));
}

// names learned by the people cache are part of the offline copy too
onPeopleChange(() => {
  persist();
  emit();
});
