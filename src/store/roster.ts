import { useEffect } from "react";
import { ApiError } from "../api/client";
import { fetchCampersPage, fetchStaffPage, type CamperListItem, type Page, type StaffListItem } from "../api/people";
import { loadAuth } from "../auth/store";
import { fetchAllPages } from "../hooks/usePagedList";
import { peopleEpoch, personInfo, rememberPeople, requestNames } from "./people";

/**
 * Names of the kids / team ON THE SCREEN BEING VIEWED (CONTRACTS_ACAMPA §15:
 * "names included only for the page being viewed (paged)").
 *
 * Nothing is read in the background for the whole app any more: a screen that
 * shows kids or team (`useCollection("campers" | "staff")`) asks for the names
 * it is missing, and only then:
 *   - the first time a kind is needed in this session scope its list is paged
 *     on demand (`GET /api/campers` / `GET /api/staff`, ≤ 200 per page — the
 *     page also carries the neutral ♥ for roles allowed health);
 *   - afterwards, ids that still have no name (a kid added later, someone the
 *     list did not cover) go through `POST /api/people/names` (batched).
 * The per-kind cache lives as long as the session scope (token + people cache
 * epoch — a logout or role / camp switch empties it). Going offline and back
 * never re-reads it: only a list whose paging failed for lack of network is
 * tried again once the connection is back.
 */
export type RosterKind = "campers" | "staff";

const toPerson = (it: CamperListItem | StaffListItem) => ({ personId: it.id, name: it.name, nickname: it.nickname, sex: it.sex, ...(it.hasHealth !== undefined ? { hasHealth: it.hasHealth } : {}) });

const PAGERS: Record<RosterKind, (token: string, cursor: string | null) => Promise<Page<CamperListItem | StaffListItem>>> = {
  campers: (token, cursor) => fetchCampersPage(token, { cursor }),
  staff: (token, cursor) => fetchStaffPage(token, { cursor }),
};

/** the session scope the state below belongs to */
let scope: string | null = null;
/** kinds whose list was paged in this scope */
const paged = new Set<RosterKind>();
/** kinds being paged right now (single flight across every screen asking) */
const running = new Set<RosterKind>();
/** the ids each kind's screens last asked about — resolved once its paging ends */
const waiting = new Map<RosterKind, string[]>();

function enterScope(token: string): string {
  const next = `${token}|${peopleEpoch()}`;
  if (scope !== next) {
    scope = next;
    paged.clear();
    running.clear();
    waiting.clear();
  }
  return next;
}

/**
 * Makes sure the names of `ids` (records of `kind` on screen) are known or on
 * their way. Cheap when nothing is missing; safe to call from every render.
 */
export function ensureRosterNames(kind: RosterKind, ids: readonly string[]): void {
  const token = loadAuth()?.token;
  if (!token) return;
  const mine = enterScope(token);
  const missing = ids.filter((id) => !personInfo(id));
  if (missing.length === 0) return;
  if (paged.has(kind)) {
    requestNames(missing);
    return;
  }
  waiting.set(kind, missing);
  if (running.has(kind)) return;
  running.add(kind);
  const alive = () => scope === mine;
  void fetchAllPages((cursor) => PAGERS[kind](token, cursor), (items) => rememberPeople(items.map(toPerson)), alive)
    .then(() => {
      if (alive()) paged.add(kind);
    })
    .catch((err) => {
      // no network: try again when a screen asks after the connection is back.
      // Anything else (not allowed, server trouble): don't loop on the list — the names endpoint covers the screen.
      if (alive() && !(err instanceof ApiError && err.status === 0)) paged.add(kind);
    })
    .finally(() => {
      if (!alive()) return;
      running.delete(kind);
      const rest = (waiting.get(kind) ?? []).filter((id) => !personInfo(id));
      waiting.delete(kind);
      if (rest.length && paged.has(kind)) requestNames(rest);
    });
}

/**
 * Hook side of `ensureRosterNames`, used by `useCollection` for the screen
 * being viewed: `records` are what the screen reads; `online` lets a list that
 * could not be paged offline try again once (and only while it still lacks names).
 */
export function useRosterNames(kind: RosterKind | null, records: readonly { id: string; name?: string }[] | null | undefined, online: boolean): void {
  const missingKey = kind && records ? records.filter((r) => !r.name).map((r) => r.id).join(",") : "";
  useEffect(() => {
    if (!kind || !online || !missingKey) return;
    ensureRosterNames(kind, missingKey.split(","));
  }, [kind, online, missingKey]);
}

/** Tests only: forget every scope. */
export function resetRosterNames(): void {
  scope = null;
  paged.clear();
  running.clear();
  waiting.clear();
}
