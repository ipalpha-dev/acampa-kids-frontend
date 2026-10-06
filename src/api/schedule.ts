import { command } from "./client";
import { bearer } from "../auth/store";
import { ROOM_ROLE_META, type RoomRole } from "./staff";

export interface ScheduleRole {
  id: string;
  name: string;
  emoji: string;
  /** sanitized HTML from the WYSIWYG editor */
  instructions: string;
  /** sanitized HTML: what to bring / wear / prepare BEFORE the camp for this role (Preparação page) */
  preparation: string;
  /**
   * POSITIONS the função falls on by itself, no escala needed (the link is
   * `Staff.roomRole`): both = toda a equipe, one = só os Líderes / só os
   * Auxiliares, `[]` = só quem for escalado à mão.
   *
   * ADDS UP with the escala: "os líderes + a Ana" is `["caretaker"]` plus one
   * assignment.
   */
  forRoomRoles: RoomRole[];
  /** the assignment carries a per-person detail (team, base, shift…) */
  hasDetail: boolean;
  /**
   * The detail is NOT typed per person: it IS the person's team
   * (`Staff.team`). Only staff WITH a team can be scaled into the role, and
   * the chip is the team (name + colour) read live from the staff record —
   * moving somebody between teams re-labels every event at once.
   */
  detailFromTeam: boolean;
  /** placeholder shown in the detail input */
  detailPlaceholder: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleRoleInput {
  name: string;
  emoji: string;
  instructions: string;
  preparation: string;
  forRoomRoles: RoomRole[];
  hasDetail: boolean;
  detailFromTeam: boolean;
  detailPlaceholder: string;
}

/**
 * WHO does a função — the ways ADD UP: by POSITION (`forRoomRoles`, no escala
 * needed) and/or by PERSON (`CampEvent.assignments`). A person does one
 * função per event: an explicit escala always wins.
 * Mirrors `backend/src/services/schedule.ts`.
 */

/** Does it fall on somebody by their position, with no escala? */
export function isAutomatic(role: Pick<ScheduleRole, "forRoomRoles"> | undefined | null): boolean {
  return !!role && role.forRoomRoles.length > 0;
}

/** Does it fall on EVERY position (= toda a equipe)? */
export function isForWholeTeam(role: Pick<ScheduleRole, "forRoomRoles"> | undefined | null): boolean {
  return !!role && role.forRoomRoles.length >= 2;
}

/** Does it reach somebody in that position by itself? */
export function autoRoleCovers(role: Pick<ScheduleRole, "forRoomRoles"> | undefined | null, roomRole: RoomRole): boolean {
  return !!role?.forRoomRoles.includes(roomRole);
}

/**
 * The função of an event that falls on somebody in that position — what they
 * do there with no escala. One aimed at a single position wins over the
 * whole-team one.
 */
export function autoRoleFor(roleIds: string[], roomRole: RoomRole, roleById: Map<string, ScheduleRole>): ScheduleRole | undefined {
  const mine = roleIds.map((id) => roleById.get(id)).filter((r) => autoRoleCovers(r, roomRole)) as ScheduleRole[];
  return mine.find((r) => !isForWholeTeam(r)) ?? mine[0];
}

/** What ONE person does in an event: their escala, else their position's função. `null` = nothing. */
export function dutyOf(
  e: Pick<CampEvent, "roles" | "assignments">,
  s: { id: string; active: boolean; roomRole: RoomRole },
  roleById: Map<string, ScheduleRole>,
): { role: ScheduleRole | undefined; assignment: EventAssignment | undefined } | null {
  const assignment = e.assignments.find((a) => a.staffId === s.id);
  if (assignment) return { role: roleById.get(assignment.roleId), assignment };
  if (!s.active) return null;
  const role = autoRoleFor(e.roles, s.roomRole, roleById);
  return role ? { role, assignment: undefined } : null;
}

/** Everyone a função reaches in an event: escalados + covered by position (minus whoever does something else). */
export function peopleInRole<T extends { id: string; active: boolean; roomRole: RoomRole }>(
  e: Pick<CampEvent, "roles" | "assignments">,
  role: Pick<ScheduleRole, "id" | "forRoomRoles">,
  staff: T[],
  roleById: Map<string, ScheduleRole>,
): { staff: T; via: "person" | "position"; assignment?: EventAssignment }[] {
  const out: { staff: T; via: "person" | "position"; assignment?: EventAssignment }[] = [];
  for (const s of staff) {
    const duty = dutyOf(e, s, roleById);
    if (duty?.role?.id !== role.id) continue;
    out.push({ staff: s, via: duty.assignment ? "person" : "position", assignment: duty.assignment });
  }
  return out;
}

/** The positions it falls on: "toda a equipe" / "os Líderes" / "os Auxiliares" / "" (só escalados). */
export function autoAudienceLabel(role: Pick<ScheduleRole, "forRoomRoles">): string {
  if (isForWholeTeam(role)) return "toda a equipe";
  const one = role.forRoomRoles[0];
  return one ? `os ${ROOM_ROLE_META[one].plural}` : "";
}

/** A staff member scaled into one of the event's roles. `detail` = team / base / colour / shift.
 *  Both stay EMPTY for a `detailFromTeam` role — use `roleDetailOf` to read the label. */
export interface EventAssignment {
  staffId: string;
  roleId: string;
  detail: string;
  /** "#rrggbb" tint for the detail chip (team colour), "" = default */
  detailColor: string;
}

/**
 * The detail label of one assignment, from the only place that knows it:
 * the person's team for a `detailFromTeam` role, the stored value otherwise.
 * Mirrors `backend/src/services/schedule.ts#assignmentDetail`.
 */
export function roleDetailOf(
  role: Pick<ScheduleRole, "detailFromTeam"> | undefined | null,
  assignment: Pick<EventAssignment, "detail" | "detailColor"> | undefined | null,
  teamOfStaff: { name: string; color: string } | undefined | null,
): { detail: string; detailColor: string } {
  if (role?.detailFromTeam) return teamOfStaff ? { detail: teamOfStaff.name, detailColor: teamOfStaff.color } : { detail: "", detailColor: "" };
  return { detail: assignment?.detail ?? "", detailColor: assignment?.detailColor ?? "" };
}

/** Cores sugeridas para o detalhe de cada pessoa (time, base, cor). */
export const DETAIL_COLORS = [
  // `key` names the swatch class (styles.scss `$detail-colors` — keep the hex values in sync)
  { key: "verde", name: "Verde", hex: "#0f9a8a" },
  { key: "laranja", name: "Laranja", hex: "#f2843b" },
  { key: "amarelo", name: "Amarelo", hex: "#f4c430" },
  { key: "vermelho", name: "Vermelho", hex: "#e8503a" },
  { key: "azul", name: "Azul", hex: "#3b6ff2" },
  { key: "roxo", name: "Roxo", hex: "#7d3bf2" },
  { key: "rosa", name: "Rosa", hex: "#e0519b" },
  { key: "cinza", name: "Cinza", hex: "#444b52" },
] as const;

export interface CampEvent {
  id: string;
  /** "YYYY-MM-DD" */
  date: string;
  title: string;
  emoji: string;
  startTime: string;
  endTime: string | null;
  notes: string;
  /** ids of the roles staff fulfil in this event */
  roles: string[];
  /** parents see this event on their programme (the team always does) */
  visibleToParents: boolean;
  assignments: EventAssignment[];
  createdAt: string;
  updatedAt: string;
}

export interface CampEventInput {
  date: string;
  title: string;
  emoji: string;
  startTime: string;
  endTime: string | null;
  notes: string;
  roles: string[];
  visibleToParents: boolean;
}

/** Programme day → spoken pt-BR (`speakDay`). Prefer importing from `../dates` in new code. */
export { speakDay as formatEventDate } from "../dates";

const json = (token: string) => ({ ...bearer(token), "content-type": "application/json" });

// ── roles ───────────────────────────────────────────────────────────────────

export interface RoleEventUsage {
  eventId: string;
  date: string;
  startTime: string;
  endTime: string | null;
  title: string;
  emoji: string;
  /** who does this função here — escalados (`via: "person"`) and those it falls on by position */
  people: { staffId: string; name: string; detail: string; via: "person" | "position" }[];
}

export interface RoleDetail {
  role: ScheduleRole;
  events: RoleEventUsage[];
}

export async function createRole(token: string, input: ScheduleRoleInput): Promise<ScheduleRole> {
  const res = await command<{ role: ScheduleRole }>("/api/schedule/roles", {
    method: "POST",
    headers: json(token),
    body: JSON.stringify(input),
  }, ["roles", "events"]);
  return res.role;
}

export async function updateRole(token: string, id: string, patch: Partial<ScheduleRoleInput>): Promise<ScheduleRole> {
  const res = await command<{ role: ScheduleRole }>(`/api/schedule/roles/${id}`, {
    method: "PUT",
    headers: json(token),
    body: JSON.stringify(patch),
  }, ["roles", "events"]);
  return res.role;
}

export async function deleteRole(token: string, id: string): Promise<void> {
  await command(`/api/schedule/roles/${id}`, { method: "DELETE", headers: bearer(token) }, ["roles", "events"]);
}

// ── events ──────────────────────────────────────────────────────────────────

export async function createEvent(token: string, input: CampEventInput): Promise<CampEvent> {
  const res = await command<{ event: CampEvent }>("/api/schedule/events", {
    method: "POST",
    headers: json(token),
    body: JSON.stringify(input),
  }, ["roles", "events"]);
  return res.event;
}

export async function updateEvent(token: string, id: string, patch: Partial<CampEventInput>): Promise<CampEvent> {
  const res = await command<{ event: CampEvent }>(`/api/schedule/events/${id}`, {
    method: "PUT",
    headers: json(token),
    body: JSON.stringify(patch),
  }, ["roles", "events"]);
  return res.event;
}

export async function setAssignments(token: string, eventId: string, assignments: EventAssignment[]): Promise<CampEvent> {
  const res = await command<{ event: CampEvent }>(`/api/schedule/events/${eventId}/assignments`, {
    method: "PUT",
    headers: json(token),
    body: JSON.stringify({ assignments }),
  }, ["roles", "events"]);
  return res.event;
}

/** Sets one person's role in an event (replacing any previous one). */
export async function assignStaff(token: string, eventId: string, staffId: string, roleId: string, detail = "", detailColor = ""): Promise<CampEvent> {
  const res = await command<{ event: CampEvent }>(`/api/schedule/events/${eventId}/assignments/${staffId}`, {
    method: "PUT",
    headers: json(token),
    body: JSON.stringify({ roleId, detail, detailColor }),
  }, ["roles", "events"]);
  return res.event;
}

export async function unassignStaff(token: string, eventId: string, staffId: string): Promise<CampEvent> {
  const res = await command<{ event: CampEvent }>(`/api/schedule/events/${eventId}/assignments/${staffId}`, {
    method: "DELETE",
    headers: bearer(token),
  }, ["roles", "events"]);
  return res.event;
}

export async function deleteEvent(token: string, id: string): Promise<void> {
  await command(`/api/schedule/events/${id}`, { method: "DELETE", headers: bearer(token) }, ["roles", "events"]);
}
