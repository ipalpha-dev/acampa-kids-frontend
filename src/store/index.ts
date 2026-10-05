import { useSyncExternalStore } from "react";
import type { Bedroom } from "../api/bedrooms";
import type { Camper, CamperRecord } from "../api/campers";
import type { Category } from "../api/categories";
import type { Transport } from "../api/transports";
import type { Instruction } from "../api/instructions";
import type { Occurrence } from "../api/occurrences";
import type { MedicationDose } from "../api/medications";
import type { PrepSection } from "../api/preparation";
import type { CampEvent, ScheduleRole } from "../api/schedule";
import type { Staff, StaffRecord } from "../api/staff";
import type { Settings } from "../api/settings";
import type { Team } from "../api/teams";
import type { ScoreEntry } from "../api/scores";
import type { GalleryPhoto } from "../api/gallery";
import type { Prescription } from "../api/medications";
import { onAuthSuccess } from "../api/client";
import { fetchOfflineKey, type OfflineKeyAnswer } from "../auth/store";
import { clearSessionCaches } from "../pwa/sessionCaches";
import { copyIsUsable, decryptJson, defaultBackend, encryptJson, importOfflineKey, stripHealth, type OfflineBackend } from "./offline";
import { clearPeople, onPeopleChange, peopleSnapshot, peopleVersion, personInfo, rememberPeople, type PersonInfo } from "./people";
import { useRosterNames, type RosterKind } from "./roster";

/**
 * Local-first data store.
 *
 * Every collection the app reads lives here, in memory, so the app keeps
 * working with no network at the camp site. The server pushes the data over a
 * WebSocket (see ./realtime.ts): a full snapshot on connect and an update after
 * every change. Writes go through the REST API; their result is confirmed by
 * the server's push. Records carry camp operations only — names come from the
 * people cache (./people.ts), read for the screen being viewed (./roster.ts);
 * health and contacts are read per person on demand.
 *
 * On the device the state survives ONLY as the encrypted, role-scoped offline
 * copy (./offline.ts, decision 35) — never in localStorage.
 */

/** What the server pushes: camp-ops records only (no names, no health). */
export interface ServerCollections extends Omit<Collections, "campers" | "staff"> {
  campers: CamperRecord[];
  staff: StaffRecord[];
}

/** What screens read: kids and team joined with their live names (people cache). */
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
  /** LOCAL ONLY (never pushed): the kids' medicines read live from IPAlpha for the care team's checklist (health) */
  prescriptions: Prescription[];
}
export type CollectionName = keyof Collections;
type ListCollectionName = Exclude<CollectionName, "settings" | "prescriptions">;
/** what the server pushes (hydration waits for these; `prescriptions` is filled locally) */
export const COLLECTION_NAMES: CollectionName[] = ["campers", "staff", "bedrooms", "categories", "transports", "teams", "scores", "roles", "events", "preparation", "instructions", "occurrences", "medications", "gallery", "settings"];

export type ConnectionState = "connecting" | "online" | "offline";

interface StoreState {
  data: Partial<ServerCollections>;
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
/**
 * The session's idle length as this device measured it when the key arrived
 * (`sessionExpiresAt` − the answer's arrival): never longer than the real
 * sessionIdleHours, so an expiry estimated from it never outlives the session.
 */
let idleMs: number | null = null;
/** The backend slides at most once a minute: estimates stay this far on the safe side. */
const SLIDE_SLACK_MS = 60_000;

interface OfflinePayload {
  data: Partial<ServerCollections>;
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
  const safe = info.healthAllowed ? payload : { ...payload, data: stripHealth(payload.data as Record<string, unknown>) as Partial<ServerCollections>, people: stripHealth({ people: payload.people }).people };
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
  idleMs = null;
  let answer: OfflineKeyAnswer;
  try {
    answer = await fetchOfflineKey(token);
  } catch {
    return;
  }
  if (epoch !== offlineEpoch) return;
  const measured = new Date(answer.sessionExpiresAt).getTime() - Date.now();
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
    // the camp is over: nothing is kept on the device any more (uploads / photos included)
    await Promise.all([backend.wipe(), clearSessionCaches()]);
    return;
  }
  offlineKey = key;
  offlineInfo = info;
  idleMs = Number.isFinite(measured) && measured > SLIDE_SLACK_MS ? measured : null;
  scheduleExpiry();
  persist();
}

/**
 * The session slid (decision 30 — sessionIdleHours is an IDLE limit): the copy
 * and its self-wipe timer follow the new expiry instead of the one the key
 * answered at the start. Fed by GET /api/auth/me / role / camp answers
 * (App.tsx) and by every authenticated request the server accepted (below).
 * Only ever moves forward; a jump under a minute is ignored (the backend
 * slides at most once a minute).
 */
export function extendOfflineSession(sessionExpiresAt: string | null | undefined): void {
  if (!offlineInfo || !sessionExpiresAt) return;
  const next = new Date(sessionExpiresAt).getTime();
  const current = new Date(offlineInfo.sessionExpiresAt).getTime();
  if (!Number.isFinite(next) || (Number.isFinite(current) && next - current < SLIDE_SLACK_MS)) return;
  offlineInfo = { ...offlineInfo, sessionExpiresAt: new Date(next).toISOString() };
  scheduleExpiry();
  // the stored meta carries the expiry too: rewrite it so a reopening reads the slid one
  persist();
}

/** When the offline copy will wipe itself for the session's sake (tests / diagnostics), or null. */
export function offlineSessionExpiresAt(): string | null {
  return offlineInfo?.sessionExpiresAt ?? null;
}

// every accepted authenticated request slid the session on the server: estimate the new expiry
// on the safe side (request start + the measured idle length − the backend's one-minute step)
onAuthSuccess((startedAt) => {
  if (!offlineInfo || idleMs === null) return;
  extendOfflineSession(new Date(startedAt + idleMs - SLIDE_SLACK_MS).toISOString());
});

/**
 * Logout, role / camp switch, 401, session end, camp end: forgets the key,
 * empties the in-memory store, deletes the encrypted copy and the service
 * worker's upload / photo caches.
 */
export async function endOfflineSession(): Promise<void> {
  offlineEpoch++;
  offlineKey = null;
  offlineInfo = null;
  idleMs = null;
  if (expiryTimer) clearTimeout(expiryTimer);
  expiryTimer = null;
  clearStore();
  await Promise.all([backend.wipe(), clearSessionCaches()]);
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
export function applyServerData(data: Partial<ServerCollections>, at: string): void {
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
export function patchCollection<K extends ListCollectionName>(name: K, fn: (list: ServerCollections[K]) => ServerCollections[K]): void {
  const current = (state.data[name] ?? []) as ServerCollections[K];
  state = { ...state, data: { ...state.data, [name]: fn(current) } };
  persist();
  emit();
}

/** Upsert one item by id. */
export function upsert<K extends ListCollectionName>(name: K, item: ServerCollections[K][number]): void {
  patchCollection(name, (list) => {
    const i = list.findIndex((x) => x.id === item.id);
    const next = list.slice() as ServerCollections[K];
    if (i < 0) next.push(item as never);
    else next[i] = item as never;
    return next;
  });
}

export function remove<K extends ListCollectionName>(name: K, id: string): void {
  patchCollection(name, (list) => list.filter((x) => x.id !== id) as ServerCollections[K]);
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

/** One joined list per (records array, people version) — stable between renders, as useSyncExternalStore needs. */
const joinCache = new WeakMap<object, { version: number; out: unknown[] }>();

/** The live person fields of a camp-ops record ("" / null while the name is not known yet). */
function withPerson<T extends { id: string }>(record: T): T & { name: string; nickname: string | null; sex: "F" | "M" | null; hasHealth?: boolean } {
  const info = personInfo(record.id);
  return { ...record, name: info?.name ?? "", nickname: info?.nickname ?? null, sex: info?.sex ?? null, ...(info?.hasHealth !== undefined ? { hasHealth: info.hasHealth } : {}) };
}

function joined(list: { id: string }[]): unknown[] {
  const v = peopleVersion();
  const hit = joinCache.get(list);
  if (hit && hit.version === v) return hit.out;
  const out = list.map(withPerson);
  joinCache.set(list, { version: v, out });
  return out;
}

/** The view of one collection: kids / team joined with their names, everything else as pushed. */
function view<K extends CollectionName>(name: K): Collections[K] | undefined {
  const raw = state.data[name];
  if (raw === undefined) return undefined;
  if (name === "campers" || name === "staff") return joined(raw as { id: string }[]) as Collections[K];
  return raw as unknown as Collections[K];
}

export interface CollectionOptions {
  /**
   * Kids / team only: read the names this screen is missing (default). Pass
   * `false` from app-wide hooks that never show names (the shell, helper
   * checks), so names are read only for the screen being viewed (./roster.ts).
   */
  names?: boolean;
}

function rosterKind(name: CollectionName, opts?: CollectionOptions): RosterKind | null {
  if (opts?.names === false) return null;
  return name === "campers" || name === "staff" ? name : null;
}

/** One collection, or `null` while this device has never received it. */
export function useCollection<K extends CollectionName>(name: K, opts?: CollectionOptions): Collections[K] | null {
  const value = useSyncExternalStore(subscribe, () => view(name) ?? null);
  const online = useSyncExternalStore(subscribe, () => state.connection === "online");
  const kind = rosterKind(name, opts);
  useRosterNames(kind, kind ? (value as { id: string; name?: string }[] | null) : null, online);
  return value;
}

/** Same, but never null (empty list until synced). */
export function useCollectionOrEmpty<K extends CollectionName>(name: K, opts?: CollectionOptions): Collections[K] {
  return useCollection(name, opts) ?? (EMPTY as unknown as Collections[K]);
}

/** Non-hook read of the joined view (assistant context, exports). */
export function readCollection<K extends CollectionName>(name: K): Collections[K] | null {
  return view(name) ?? null;
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
