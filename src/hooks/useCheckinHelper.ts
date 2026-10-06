import { useEffect, useRef, useState } from "react";
import type { Settings } from "../api/settings";
import type { CoreRole } from "../roles";
import { requestSnapshot } from "../store/realtime";
import { patchCollection, useCollection } from "../store";

const MAX_TIMEOUT = 2 ** 31 - 1;

export interface HelperAccess {
  /** church check-in helper (`checkin`), and the check-in window is open right now */
  church: boolean;
  /** bus roll-call helper (`checkin-onibus`), and the check-in window is open right now */
  bus: boolean;
  /** the vehicle the coordenação linked this bus helper to; null when not a bus helper / both windows closed */
  busVehicle: string | null;
  /** which trip windows are open for this helper */
  busOutbound: boolean;
  busReturn: boolean;
  /** `organizacao` (no window): the coordenação's tabs and settings (minus the coordenação-only ones), on top of their own team tabs */
  organizer: boolean;
  /** `organizacao-jogos` (no window): edits the programme, sees the whole team and writes the scoreboard (Placar) */
  gameOrganizer: boolean;
  /** `pontuacao` (no window): bulk QR scan by event only; no per-team points, no zero, deletes only own scans */
  scoreHelper: boolean;
  /** `saude` (no window): every camper, bedroom and vehicle, the whole time */
  medical: boolean;
  /** `coletes` — until VEST_GRACE_DAYS after the camp: hands out / takes back the team vests */
  vest: boolean;
  /** `fotografia` (no window): uploads, edits and publishes the camp's photos */
  photographer: boolean;
}

export const NO_HELPER: HelperAccess = { church: false, bus: false, busVehicle: null, busOutbound: false, busReturn: false, organizer: false, gameOrganizer: false, scoreHelper: false, medical: false, vest: false, photographer: false };

type Windows = Pick<Settings, "checkinWindow" | "busReturnWindow" | "busHelpers"> & Partial<Pick<Settings, "checkinTestMode">>;

/** the vest helpers keep their tab this long after the camp ends (mirrors the server's VEST_GRACE_DAYS) */
export const VEST_GRACE_DAYS = 7;

/**
 * What the ACTING role adds on top of an ordinary team member. Every helper is
 * its own IPAlpha project role (decision 26) — the session acts as ONE of
 * them at a time, so this reads `activeRole`; the check-in / bus windows
 * (camp ops) come from the settings. Re-evaluates on its own at the next
 * window edge and asks the server for a fresh snapshot there, so the
 * roll-call tab appears / disappears without a reload. The server enforces
 * the same rules; this only drives the UI.
 *
 * When a window closes the extra data is purged locally right away (kids /
 * bedrooms outside the person's own room).
 */
export function useCheckinHelper(activeRole: CoreRole, personId: string, enabled: boolean, campEndsAt: number | null = null): HelperAccess {
  // app-wide check (mounted by the shell): reads the records only, never names
  const staff = useCollection("staff", { names: false });
  const lists = useCollection("settings") as Windows | null;
  const [, tick] = useState(0);

  const me = staff?.find((s) => s.id === personId) ?? null;
  const now = Date.now();
  const from = lists?.checkinWindow.from ? new Date(lists.checkinWindow.from).getTime() : null;
  const until = lists?.checkinWindow.until ? new Date(lists.checkinWindow.until).getTime() : null;
  const returnFrom = lists?.busReturnWindow?.from ? new Date(lists.busReturnWindow.from).getTime() : null;
  const returnUntil = lists?.busReturnWindow?.until ? new Date(lists.busReturnWindow.until).getTime() : null;
  const departureOpen = !!lists?.checkinTestMode || (from !== null && until !== null && from <= now && now < until);
  const returnOpen = !!lists?.checkinTestMode || (returnFrom !== null && returnUntil !== null && returnFrom <= now && now < returnUntil);
  const church = activeRole === "checkin" && departureOpen;
  const isBusHelper = activeRole === "checkin-onibus";
  const linkedVehicle = isBusHelper && lists ? (lists.busHelpers.helpers.find((h) => h.personId === personId)?.vehicleId ?? null) : null;
  const busOutbound = departureOpen && linkedVehicle !== null;
  const busReturn = returnOpen && linkedVehicle !== null;
  const busVehicle = busOutbound || busReturn ? linkedVehicle : null;
  const bus = busVehicle !== null;
  const gameOrganizer = activeRole === "organizacao-jogos";
  const scoreHelper = activeRole === "pontuacao";
  const organizer = activeRole === "organizacao";
  const medical = activeRole === "saude";
  const vestOpen = campEndsAt === null || now < campEndsAt + VEST_GRACE_DAYS * 24 * 60 * 60 * 1000;
  const vest = activeRole === "coletes" && vestOpen;
  const photographer = activeRole === "fotografia";
  const anyOpen = church || bus;
  const myBedroom = me?.bedroom ?? null;

  // wake up at the next window edge (only matters for the roll-call roles)
  const windowed = activeRole === "checkin" || linkedVehicle !== null;
  const edge = windowed ? ([from, until, returnFrom, returnUntil].filter((t): t is number => t !== null && t > now).sort((a, b) => a - b)[0] ?? null) : null;
  useEffect(() => {
    if (edge === null) return;
    const t = setTimeout(() => {
      tick((n) => n + 1);
      requestSnapshot();
    }, Math.min(edge - Date.now() + 700, MAX_TIMEOUT));
    return () => clearTimeout(t);
  }, [edge, church, bus]);

  // a roll-call window open → closed: drop everything beyond the person's own room, right now
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !anyOpen && windowed) {
      patchCollection("campers", (list) => list.filter((k) => myBedroom !== null && k.bedroom === myBedroom));
      patchCollection("bedrooms", (list) => list.filter((b) => b.id === myBedroom));
    }
    wasOpen.current = anyOpen;
  }, [anyOpen, windowed, myBedroom]);

  return enabled ? { church, bus, busVehicle, busOutbound, busReturn, organizer, gameOrganizer, scoreHelper, medical, vest, photographer } : NO_HELPER;
}
