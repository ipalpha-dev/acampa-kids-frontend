import { useEffect, useRef } from "react";
import { patchCollection, useCollection } from "../store";

/**
 * A room CARETAKER only sees the OTHER kids of their room (the ones under a
 * colleague's care) WHILE THE CAMP IS HAPPENING — mirrors the server's
 * `campActive` gate (services/scope.ts#camperVisibility, services/camp.ts).
 * The server stops sending those kids in its next snapshot once the camp is
 * over, but a phone that is offline at that instant would keep them in
 * localStorage. This hook purges them the moment the camp ends, so a
 * caretaker is left with only the kids under their own care (`caretakerId`).
 *
 * A HELPER has no camp gate (they get the room's kids the whole time), so
 * nothing is purged for them. Same for people whose scope is NOT the room
 * (medical team, organizers, score helpers): they keep every kid the server
 * sent, camp or not.
 *
 * @param enabled  the acting role is a room-scoped team role (not saúde / organização / pontuação)
 * @param personId the logged-in person (their staff record has the same id)
 * @param during   the camp is happening right now (campPhase#useCampTiming)
 */
export function useCampWindow(enabled: boolean, personId: string, during: boolean): void {
  const staff = useCollection("staff");
  const settings = useCollection("settings");
  const me = staff?.find((s) => s.id === personId) ?? null;
  const isCaretaker = me?.roomRole === "caretaker";
  const myId = me?.id ?? null;
  // wait for both collections so a medical/organizer login is never mistaken
  // for an ordinary caretaker on the first paint (that used to wipe the kids)
  const ready = enabled && staff !== null && settings !== null;
  // saúde / organização / pontuação are not room-scoped: the caller passes enabled=false for them
  const keepAll = false;

  // camp in progress → over: a caretaker keeps only their own kids
  const wasDuring = useRef(false);
  useEffect(() => {
    if (!ready || keepAll) return;
    if (wasDuring.current && !during && isCaretaker && myId !== null) {
      patchCollection("campers", (list) => list.filter((k) => k.caretakerId === myId));
    }
    wasDuring.current = during;
  }, [ready, keepAll, during, isCaretaker, myId]);

  // outside the camp nothing about the other kids may sit in localStorage,
  // even from a stale snapshot loaded while offline
  useEffect(() => {
    if (!ready || keepAll || during || !isCaretaker || myId === null) return;
    patchCollection("campers", (list) => {
      const own = list.filter((k) => k.caretakerId === myId);
      return own.length === list.length ? list : own;
    });
  }, [ready, keepAll, during, isCaretaker, myId]);
}
