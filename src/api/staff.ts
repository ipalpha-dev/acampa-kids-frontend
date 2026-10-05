import { api, command } from "./client";
import { bearer } from "../auth/store";
import { ICONS } from "../icons";
import type { PersonLive } from "./campers";

/** Category keys that feed each staff field (must match the backend). */
export const STAFF_CATEGORY_KEYS = {
  allergies: "alergias",
  drugAllergies: "alergia-medicamentos",
  healthIssues: "condicao-cronica",
} as const;

/**
 * A team member's camp-ops record (participants, CONTRACTS_ACAMPA §15). The
 * id IS the IPAlpha person id. No person data here: name / nickname / sex are
 * joined live by the store; phone, e-mail and health are read per person on
 * demand (GET /api/people/:personId/data/:kind — core's role rules decide).
 */
export interface StaffRecord {
  /** the IPAlpha person id */
  id: string;
  personId: string;
  active: boolean;
  team: string | null;
  /** Transport id (see api/transports.ts) — bus / car, not a category option */
  transportation: string | null;
  /** Bedroom id (see api/bedrooms.ts) — not a category option */
  bedroom: string | null;
  /** CARETAKER ("líder"): looks after specific kids; HELPER ("auxiliar"): only helps out in the room */
  roomRole: RoomRole;
  generalNotes: string;
  aiReviewStatus?: "pending" | "processing" | "structured" | "reviewed" | "error" | null;
  aiReviewError?: string;
  aiReviewStartedAt?: string | null;
  aiReviewFinishedAt?: string | null;
  /** set when the person arrived on departure day */
  checkin: import("./campers").CamperCheckin | null;
  /** the team vest (colete): handed out, then taken back */
  vest: VestStatus;
  /** Preparação items ticked as done: "section:<id>" | "role:<id>" */
  prepDone: string[];
  /** distinct kids scanned via the emergency QR outside this person's scope */
  foreignLookupCount?: number;
  /** person ids of those kids */
  foreignLookupCamperIds?: string[];
  /**
   * true when the server sent a reduced record: the viewer is a colleague in
   * the same room, a parent or a vest helper — not the coordenação nor the
   * person themself (transport, check-in and notes are blank)
   */
  redacted?: boolean;
  createdAt: string;
  updatedAt: string;
}

/** What screens read: the camp-ops record + the live person fields (name, nickname, sex, ♥). */
export interface Staff extends StaffRecord, PersonLive {}

/** Vest (colete) check-out / check-in: `returned` is never set without `delivered`. */
export interface VestStatus {
  delivered: import("./campers").CamperCheckin | null;
  returned: import("./campers").CamperCheckin | null;
}

export type RoomRole = "caretaker" | "helper";
/** `icon` is the head-only paper-cut image (render it with <RoomRoleIcon>). */
export const ROOM_ROLE_META: Record<RoomRole, { label: string; plural: string; icon?: string; hint: string }> = {
  caretaker: { label: "Líder", plural: "Líderes", icon: ICONS.leaderFaceWoman, hint: "cuida de crianças específicas do quarto" },
  helper: { label: "Auxiliar", plural: "Auxiliares", icon: ICONS.helperFaceWoman, hint: "ajuda no quarto, sem crianças próprias" },
};

/** Room rosters: leaders first, then assistants; alphabetical inside each role. */
export function compareRoomStaff(a: { name: string; roomRole: RoomRole }, b: { name: string; roomRole: RoomRole }): number {
  const roleOrder: Record<RoomRole, number> = { caretaker: 0, helper: 1 };
  return roleOrder[a.roomRole] - roleOrder[b.roomRole] || a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });
}

/** Camp-ops fields the coordenação / organização may write (PUT /api/staff/:id). */
export interface StaffInput {
  active: boolean;
  team: string | null;
  bedroom: string | null;
  roomRole: RoomRole;
  transportation: string | null;
  generalNotes: string;
}

/** A NEW team member registered in IPAlpha by the coordenação (`POST /api/staff/register`). */
export interface StaffRegistration extends Partial<StaffInput> {
  name: string;
  /** E.164 — how the person signs in */
  phone: string;
  sex?: import("./campers").CamperSex | null;
  homeChurch?: string;
  emergencyContact?: { name: string; phone: string; relation?: string };
}

/**
 * A team member's sex: girls/boys room wins, otherwise the sex from IPAlpha (shown like the name).
 */
export function staffSex(s: Pick<Staff, "bedroom" | "sex">, bedrooms: Pick<import("./bedrooms").Bedroom, "id" | "group">[]): import("./campers").CamperSex | null {
  const group = s.bedroom ? bedrooms.find((b) => b.id === s.bedroom)?.group : undefined;
  if (group === "girls") return "F";
  if (group === "boys") return "M";
  return s.sex ?? null;
}

const json = (token: string) => ({ ...bearer(token), "content-type": "application/json" });

export interface StaffScheduleItem {
  eventId: string;
  date: string;
  startTime: string;
  endTime: string | null;
  title: string;
  emoji: string;
  role: { id: string; name: string; emoji: string; instructions: string } | null;
  detail: string;
  /** true when it comes from a "for everyone" role, not an explicit assignment */
  implicit: boolean;
  /** the event's "for everyone" role — what the person falls back to when unassigned (null = none) */
  defaultRole: { id: string; name: string; emoji: string } | null;
}

export interface StaffDetail {
  staff: Staff;
  bedroom: { id: string; name: string; group: "girls" | "boys" | "staff" } | null;
  schedule: StaffScheduleItem[];
  /** kids sleeping in this person's bedroom (their responsibility) */
  campers: import("./campers").Camper[];
  /** the OTHER kids of the room (a caretaker: those under someone else's care; a helper: none) */
  otherCampers: import("./campers").Camper[];
  /** other staff in the same bedroom */
  roommates: Staff[];
}

/** An existing IPAlpha person joins this camp's team (`POST /api/staff {personId, …ops}`). */
export async function addStaff(token: string, personId: string, ops: Partial<StaffInput> = {}): Promise<StaffRecord> {
  const res = await command<{ staff: StaffRecord }>("/api/staff", { method: "POST", headers: json(token), body: JSON.stringify({ personId, ...ops }) }, ["staff", "bedrooms"]);
  return res.staff;
}

/** A NEW person registered in IPAlpha + `equipe` membership + the camp-ops row (coordenação). */
export async function registerStaff(token: string, input: StaffRegistration): Promise<{ staff: StaffRecord & { name: string }; created: boolean }> {
  return command("/api/staff/register", { method: "POST", headers: json(token), body: JSON.stringify(input) }, ["staff", "bedrooms"]);
}

/** One team member's page: camp ops + name + health (self / managers) — read live. */
export async function fetchStaff(token: string, id: string): Promise<Staff> {
  const res = await api<{ staff: Staff }>(`/api/staff/${encodeURIComponent(id)}`, { headers: bearer(token) });
  return res.staff;
}

export async function updateStaff(token: string, id: string, patch: Partial<StaffInput>): Promise<StaffRecord> {
  const res = await command<{ staff: StaffRecord }>(`/api/staff/${id}`, {
    method: "PUT",
    headers: json(token),
    body: JSON.stringify(patch),
  }, ["staff", "bedrooms"]);
  return res.staff;
}

/** What to do with the kids under a caretaker's care when the caretaker changes room (see POST /api/staff/:id/move). */
export type MoveKids = "orphan" | "bring" | "assign" | "swap";
export interface MoveStaffInput {
  bedroom: string | null;
  kids: MoveKids;
  /** kids: "assign" — the member of the SAME room who takes the kids (a helper is promoted) */
  assignTo?: string;
  /** kids: "swap" — the member of the TARGET room who comes to this room and takes these kids */
  swapWith?: string;
}

export async function moveStaff(token: string, id: string, input: MoveStaffInput): Promise<StaffRecord> {
  const res = await command<{ staff: StaffRecord }>(`/api/staff/${id}/move`, { method: "POST", headers: json(token), body: JSON.stringify(input) }, ["staff", "bedrooms", "campers"]);
  return res.staff;
}

/** The team member arrived. */
export async function checkinStaff(token: string, id: string): Promise<StaffRecord> {
  const res = await command<{ staff: StaffRecord }>(`/api/staff/${id}/checkin`, { method: "POST", headers: bearer(token) }, ["staff"]);
  return res.staff;
}

export async function undoCheckinStaff(token: string, id: string): Promise<StaffRecord> {
  const res = await command<{ staff: StaffRecord }>(`/api/staff/${id}/checkin`, { method: "DELETE", headers: bearer(token) }, ["staff"]);
  return res.staff;
}

// ── vest (colete): admin or a listed vest helper ──

export type VestAction = "deliver" | "undo-deliver" | "return" | "undo-return";

/** Stamps / clears the vest delivery or return of one team member. */
export async function setStaffVest(token: string, id: string, action: VestAction): Promise<StaffRecord> {
  const path = `/api/staff/${id}/vest/${action.endsWith("deliver") ? "delivery" : "return"}`;
  const method = action.startsWith("undo") ? "DELETE" : "POST";
  const res = await command<{ staff: StaffRecord }>(path, { method, headers: bearer(token) }, ["staff"]);
  return res.staff;
}

// ── self check-in (the logged-in team member, on departure day, at the church) ──

export type SelfCheckinBlock = "NOT_LINKED" | "INACTIVE" | "NO_SCHEDULE" | "NOT_TODAY" | "NOT_YET" | "ALREADY_CHECKED_IN";

export interface SelfCheckinStatus {
  allowed: boolean;
  reason: { code: SelfCheckinBlock; message: string } | null;
  /** the departure day ("YYYY-MM-DD") — null when the programme is empty */
  date: string | null;
  /** ISO instant from which the check-in is accepted (1 h before the first event) — null when the programme is empty */
  opensAt: string | null;
  /** every meeting point — the phone shows the distance to the nearest one */
  locations: import("./settings").CheckinLocation[];
  staff: StaffRecord | null;
}

export async function getSelfCheckinStatus(token: string): Promise<SelfCheckinStatus> {
  return api<SelfCheckinStatus>("/api/staff/me/checkin", { headers: bearer(token) });
}

/** Sends the device position; the server decides whether it is close enough. */
export async function selfCheckin(token: string, pos: { lat: number; lng: number; accuracyM?: number }): Promise<{ staff: StaffRecord; distanceM: number; location: import("./settings").CheckinLocation }> {
  const res = await command<{ staff: StaffRecord; distanceM: number; location: import("./settings").CheckinLocation }>("/api/staff/me/checkin", {
    method: "POST",
    headers: json(token),
    body: JSON.stringify(pos),
  }, ["staff"]);
  return res;
}

/** Ticks / unticks one item of the logged-in person's Preparação checklist. */
export async function setMyPrepDone(token: string, key: string, done: boolean): Promise<StaffRecord> {
  const res = await command<{ staff: StaffRecord }>(`/api/staff/me/prep/${key}`, { method: "PUT", headers: json(token), body: JSON.stringify({ done }) }, ["staff"]);
  return res.staff;
}

/** The person leaves this camp's team (the IPAlpha membership is removed when the coordenação may). */
export async function deleteStaff(token: string, id: string): Promise<{ membershipRemoved: boolean }> {
  return command(`/api/staff/${id}`, { method: "DELETE", headers: bearer(token) }, ["staff", "bedrooms", "events"]);
}
