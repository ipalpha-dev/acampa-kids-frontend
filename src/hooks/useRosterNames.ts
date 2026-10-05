import { useEffect, useRef, useState } from "react";
import { fetchCampersPage, fetchStaffPage, type CamperListItem, type StaffListItem } from "../api/people";
import { useCollection, useConnection } from "../store";
import { personInfo, rememberPeople, requestNames } from "../store/people";
import { fetchAllPages } from "./usePagedList";

const toPerson = (it: CamperListItem | StaffListItem) => ({ personId: it.id, name: it.name, nickname: it.nickname, sex: it.sex, ...(it.hasHealth !== undefined ? { hasHealth: it.hasHealth } : {}) });

/**
 * Keeps the live names (+ neutral ♥) of the kids and the team the viewer may
 * see: pages `GET /api/campers` and `GET /api/staff` in the background
 * (≤ 200 per page) whenever the realtime records bring ids the people cache
 * does not know yet, and once per connection (names may change in IPAlpha).
 * Ids the lists did not cover go through `POST /api/people/names`.
 */
export function useRosterNames(token: string): void {
  const campers = useCollection("campers");
  const staff = useCollection("staff");
  const connection = useConnection();
  const running = useRef(false);
  /** bumps after each run so ids that arrived meanwhile get their own run */
  const [round, setRound] = useState(0);
  const synced = useRef<string | null>(null);
  /** ids already looked up in this connection (a person the viewer may not know stays unnamed — no retry loop) */
  const attempted = useRef(new Set<string>());

  const key = `${token}|${connection === "online" ? "on" : "off"}`;
  if (synced.current !== key && attempted.current.size) attempted.current = new Set();
  const ids = [...(campers ?? []), ...(staff ?? [])].map((r) => r.id);
  const missing = ids.filter((id) => !personInfo(id) && !attempted.current.has(id));
  const needSync = connection === "online" && (synced.current !== key || missing.length > 0);

  // a run is only abandoned when the session / connection changes or the screen goes away —
  // never because its own pages taught the cache new names
  const runKey = useRef<string | null>(null);
  useEffect(() => () => {
    runKey.current = null;
  }, []);

  useEffect(() => {
    if (!needSync || running.current) return;
    running.current = true;
    runKey.current = key;
    const alive = () => runKey.current === key;
    const batch = ids;
    const hasCampers = !!campers?.length;
    const hasStaff = !!staff?.length;
    void (async () => {
      try {
        if (hasCampers) await fetchAllPages((cursor) => fetchCampersPage(token, { cursor }), (items) => rememberPeople(items.map(toPerson)), alive);
        if (hasStaff && alive()) await fetchAllPages((cursor) => fetchStaffPage(token, { cursor }), (items) => rememberPeople(items.map(toPerson)), alive);
      } catch {
        // offline / not allowed: the names endpoint below still tries the rest
      } finally {
        running.current = false;
        if (alive()) {
          for (const id of batch) attempted.current.add(id);
          synced.current = key;
          const still = batch.filter((id) => !personInfo(id));
          if (still.length) requestNames(still);
          setRound((n) => n + 1);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needSync, key, missing.length > 0, round]);
}
