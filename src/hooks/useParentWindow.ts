import { useEffect, useRef, useState } from "react";
import { requestSnapshot } from "../store/realtime";
import { patchCollection, useCollection } from "../store";

const MAX_TIMEOUT = 2 ** 31 - 1;

export interface ParentAccess {
  /** the parents' window (check-in start → end of the last event) is open right now: the kids' ROOM TEAM is shown */
  open: boolean;
  /** the kids' CHECK-IN window is open right now: the QR dialog pops up */
  checkin: boolean;
  /** ISO of the parents' window start (null = no programme yet) */
  opensAt: string | null;
  closesAt: string | null;
}

const NONE: ParentAccess = { open: false, checkin: false, opensAt: null, closesAt: null };

/**
 * Is the PARENT inside the window in which they may see their kid's ROOM TEAM
 * (caretaker, room staff)? Mirrors the server (`services/camp.ts#parentWindow`):
 * from the kids' check-in start to the end of the last event. Re-evaluates
 * itself at the next edge and asks the server for a fresh snapshot there.
 *
 * The IMPORTANT CONTACTS (Settings → Contatos) are NOT gated by this window:
 * a parent has them for as long as they may use the app. So when the window
 * closes only the room team is dropped from localStorage — the contacts stay
 * (the server keeps sending them, but the phone may be offline right then and
 * the room team may not linger).
 */
export function useParentWindow(enabled: boolean): ParentAccess {
  const settings = useCollection("settings");
  const [, tick] = useState(0);
  const now = Date.now();
  const at = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : null);
  const from = at(settings?.parentWindow?.from);
  const until = at(settings?.parentWindow?.until);
  const open = from !== null && until !== null && from <= now && now < until;
  const cFrom = at(settings?.checkinWindow.from);
  const cUntil = at(settings?.checkinWindow.until);
  const checkin = !!settings?.checkinTestMode || (cFrom !== null && cUntil !== null && cFrom <= now && now < cUntil);

  // wake up at the next edge (parents' or check-in window)
  const edge = [from, until, cFrom, cUntil].filter((t): t is number => t !== null && t > now).sort((a, b) => a - b)[0] ?? null;
  useEffect(() => {
    if (!enabled || edge === null) return;
    const t = setTimeout(() => {
      tick((n) => n + 1);
      requestSnapshot();
    }, Math.min(edge - Date.now() + 700, MAX_TIMEOUT));
    return () => clearTimeout(t);
  }, [enabled, edge, open, checkin]);

  /** the staff ids the parent keeps outside the window: the important contacts */
  const contactIds = (settings?.parentContacts ?? []).map((c) => c.personId).join(",");

  // open → closed, and any stale snapshot: only the important contacts may stay on the phone
  const wasOpen = useRef(false);
  useEffect(() => {
    if (!enabled || !settings || open) {
      wasOpen.current = open;
      return;
    }
    const keep = new Set(contactIds ? contactIds.split(",") : []);
    patchCollection("staff", (list) => (list.some((s) => !keep.has(s.id)) ? list.filter((s) => keep.has(s.id)) : list));
    wasOpen.current = open;
  }, [enabled, settings, open, contactIds]);

  return enabled ? { open, checkin, opensAt: settings?.parentWindow?.from ?? null, closesAt: settings?.parentWindow?.until ?? null } : NONE;
}
