import { api, command } from "./client";
import { bearer } from "../auth/store";

/** Where the team must be to check themselves in on departure day. */
/** One meeting point for the team's self check-in (the church, the camp site…); the nearest one within its radius wins. */
export interface CheckinLocation {
  id: string;
  /** shown to the team: "Igreja", "Acampamento"… */
  name: string;
  lat: number;
  lng: number;
  /** metres around the point that still count as "arrived" */
  radiusM: number;
}

/** Which changes are texted (SMS) to the team members concerned. */
export interface NotificationSettings {
  /** a kid enters / leaves the person's bedroom */
  bedroomChanges: boolean;
  /** the person's role in an event changes (assigned, reassigned, removed, event moved / deleted) */
  roleChanges: boolean;
  /** the person's church check-in was recorded (by themselves or by the admin roll call) */
  checkinConfirmation: boolean;
  /** an Instruções document / Preparação section was created or edited, or the instructions / preparation text of one of the person's roles changed */
  contentChanges: boolean;
  /** a Preparação section posted to the PARENTS was created or edited → every parent, only while the parents' access window is open */
  parentContentChanges: boolean;
  /** added to the team or to an admin list (organizer, helper, medical, vest helper, parent contact) — SMS with the app link */
  enrolments: boolean;
  /** the person's OWN allocation changed: bedroom, team or vehicle (bus) */
  staffChanges: boolean;
  /** an occurrence was registered — every admin is texted */
  occurrences: boolean;
  /** at `checkinReminder.at` the whole team is reminded to do their check-in (nothing goes out while the date is unset) */
  checkinReminder: boolean;
  /** a parent edited their kid's "Informações de saúde": medical data → medical team + admins + caretaker; observations only → caretaker */
  parentEdits: boolean;
  /** the kid boarded the bus → the guardian is texted */
  busCheckin: boolean;
  /** when the PARENTS' access window opens each parent gets, once ever, the welcome SMS with the app link */
  parentWelcome: boolean;
  /** a kid's birthday falls on a camp day → at 07:45 that day the whole team of the kid's room is texted */
  birthdays: boolean;
  /** the photographer published photos → the whole team and every responsible receive an SMS */
  photoPublishes: boolean;
}

/** One-shot reminder to the whole team to do their check-in. */
export interface CheckinReminder {
  /** ISO instant; null = no reminder */
  at: string | null;
  /** read-only: when it went out (null until then; reset whenever `at` changes) */
  sentAt: string | null;
}

/** The time window in which the check-in helpers (church AND bus) may act. */
export interface CheckinWindow {
  /** ISO instants; null = not set (window never opens) */
  from: string | null;
  until: string | null;
  /** read-only: is the window open right now (server clock)? */
  open: boolean;
}

/** One `checkin-onibus` person at the door of one vehicle — the role lives in IPAlpha, the vehicle here */
export interface BusHelper {
  personId: string;
  vehicleId: string;
}

export interface BusHelperList {
  helpers: BusHelper[];
}

/** A person and the purpose shown beside them on the parents' contacts screen. */
export interface ParentContact {
  id: string;
  title: string;
  personId: string;
}

export interface Settings {
  /** at least one meeting point (Settings → Check-in) */
  checkinLocations: CheckinLocation[];
  /** read-only: when PARENTS see the team's contacts — from the kids' check-in start to the end of the last event */
  parentWindow: CheckinWindow;
  notifications: NotificationSettings;
  checkinWindow: CheckinWindow;
  /** separate window for boarding the return bus to church */
  busReturnWindow: CheckinWindow;
  /** `checkin-onibus` people: each linked to ONE vehicle; inside the window they receive the kids of that vehicle, names only (`Camper.redacted`) */
  busHelpers: BusHelperList;
  /** ordered staff contacts that will be shared with parents */
  parentContacts: ParentContact[];
  /** when ORDINARY team members (on no list) may use the app; both ends null = always */
  staffAccessWindow: CheckinWindow;
  /** when PARENTS may use the app (and the moment their welcome SMS goes out); both ends null = always */
  parentAccessWindow: CheckinWindow;
  /** test mode: church + bus check-in open for the helpers regardless of the window (team self check-in unaffected) */
  checkinTestMode: boolean;
  /** the kids' room allocation is still a draft: caretakers see no kids in their room and no room SMS goes out */
  kidsRoomsDraft: boolean;
  /** scoreboard rehearsal: the Placar tab opens and accepts points regardless of the camp days; off + outside the camp = no tab, no writes */
  scoreDraft: boolean;
  /** suspense window: while open, whoever does not launch points sees the Placar with the totals hidden; written through PUT /api/scores/suspense */
  scoreHideWindow: CheckinWindow;
  /** setup wizard lock: the admin lands in the assistant until they finish or leave; settings gear is blocked */
  wizardMode: boolean;
  /** the photo album is visible to the camp; while false only the photographers (and the admin) see it */
  galleryPublished: boolean;
  /** the "do your check-in" SMS to the whole team, scheduled for one instant */
  checkinReminder: CheckinReminder;
  /** read-only: this session is a deployment owner (SUPER_ADMIN_PERSON_IDS) — the only one who sees / edits ⚙️ → Sementes */
  superAdmin: boolean;
  /**
   * Staff who scanned ≥3 kids outside their scope (emergency QR). Empty when
   * nobody reached the threshold — the Geral card stays hidden then.
   */
  foreignLookupOffenders?: ForeignLookupOffender[];
  updatedAt: string | null;
}

/** One team member past the out-of-scope emergency-QR alert threshold (names read live). */
export interface ForeignLookupOffender {
  personId: string;
  count: number;
  camperIds: string[];
  blocked: boolean;
}

/** Igreja Presbiteriana em Alphaville (same default as the backend). */
export const DEFAULT_CHECKIN_LOCATION: CheckinLocation = {
  id: "church",
  name: "Igreja",
  lat: -23.48053637134259,
  lng: -46.83077891444747,
  radiusM: 300,
};

export interface SettingsPatch {
  checkinLocations?: CheckinLocation[];
  /** partial: only the keys sent are changed */
  notifications?: Partial<NotificationSettings>;
  checkinWindow?: { from: string | null; until: string | null };
  busReturnWindow?: { from: string | null; until: string | null };
  busHelpers?: BusHelperList;
  parentContacts?: ParentContact[];
  staffAccessWindow?: { from: string | null; until: string | null };
  parentAccessWindow?: { from: string | null; until: string | null };
  checkinTestMode?: boolean;
  kidsRoomsDraft?: boolean;
  scoreDraft?: boolean;
  wizardMode?: boolean;
  galleryPublished?: boolean;
  checkinReminder?: { at: string | null };
}

/** Who would get the welcome SMS right now (person ids; names read live). */
export interface WelcomePreview {
  staff: { count: number; windowOpen: boolean; personIds: string[] };
  parents: { count: number; windowOpen: boolean; personIds: string[] };
}

/** How many people would get the welcome SMS right now if the toggle were on (never welcomed, phone, window open). */
export async function welcomePreview(token: string): Promise<WelcomePreview> {
  return api<WelcomePreview>("/api/settings/welcome-preview", { headers: bearer(token) });
}

/** Clears every check-in (kids' church + both bus trips, team) and the audit log — for rehearsing the process. */
export async function resetCheckins(token: string): Promise<{ campers: number; staff: number; vests: number }> {
  return command<{ campers: number; staff: number; vests: number }>("/api/settings/checkin/reset", { method: "POST", headers: bearer(token) }, ["campers", "staff"]);
}

/** Zeroes every staff member's out-of-scope emergency-QR counter (and unblocks anyone at ≥5). */
export async function resetForeignLookups(token: string): Promise<{ staff: number }> {
  return command<{ staff: number; settings: Settings }>("/api/settings/foreign-lookups/reset", { method: "POST", headers: bearer(token) }, ["staff", "settings"]);
}

/** Writes go through REST; the canonical value arrives in the `settings` WebSocket collection. */
export async function updateSettings(token: string, patch: SettingsPatch): Promise<void> {
  await command<{ settings: Settings }>(
    "/api/settings",
    {
      method: "PUT",
      headers: { ...bearer(token), "content-type": "application/json" },
      body: JSON.stringify(patch),
    },
    ["settings"],
  );
}

/** Google Maps link for a point (used on the settings page to double-check the pin). */
export function mapsLink(loc: { lat: number; lng: number }): string {
  return `https://www.google.com/maps?q=${loc.lat},${loc.lng}`;
}
