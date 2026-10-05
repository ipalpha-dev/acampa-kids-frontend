import { useMemo } from "react";
import type { Bedroom, BedroomDetail } from "../api/bedrooms";
import type { Camper, CamperDetail } from "../api/campers";
import type { Category, CategoryAudience } from "../api/categories";
import { autoRoleCovers, autoRoleFor, dutyOf, peopleInRole, roleDetailOf, type CampEvent, type RoleDetail, type ScheduleRole } from "../api/schedule";
import { compareRoomStaff, type Staff, type StaffDetail, type StaffScheduleItem } from "../api/staff";
import type { Team } from "../api/teams";
import type { Transport } from "../api/transports";
import { useCollection, useCollectionOrEmpty } from "./index";

/**
 * The `/detail` REST endpoints join several collections on the server. Since
 * every collection is already on the device, the same joins are done here —
 * so detail pages open instantly and work with no connection.
 * Each function mirrors its backend counterpart in routes/*.ts.
 */

const byName = <T extends { name: string }>(a: T, b: T) =>
  a.name.localeCompare(b.name, typeof document !== "undefined" ? document.documentElement.lang || "pt-BR" : "pt-BR", { sensitivity: "base" });

/** `null` while the collections haven't arrived; `undefined` when the id doesn't exist. */
export function useCamperDetail(camperId: string): CamperDetail | null | undefined {
  const campers = useCollection("campers");
  const staff = useCollectionOrEmpty("staff");
  const bedrooms = useCollectionOrEmpty("bedrooms");
  return useMemo(() => {
    if (!campers) return null;
    const k = campers.find((x) => x.id === camperId);
    if (!k) return undefined;
    const room = k.bedroom ? bedrooms.find((b) => b.id === k.bedroom) : null;
    return {
      camper: k,
      bedroom: room ? { id: room.id, name: room.name, group: room.group } : null,
      caretaker: k.caretakerId ? (staff.find((s) => s.id === k.caretakerId) ?? null) : null,
      caretakers: k.bedroom ? staff.filter((s) => s.bedroom === k.bedroom).sort(compareRoomStaff) : [],
      roommates: k.bedroom ? campers.filter((x) => x.bedroom === k.bedroom && x.id !== k.id).sort(byName) : [],
    };
  }, [campers, staff, bedrooms, camperId]);
}

export function useBedroomDetail(bedroomId: string): BedroomDetail | null | undefined {
  const bedrooms = useCollection("bedrooms");
  const campers = useCollectionOrEmpty("campers");
  const staff = useCollectionOrEmpty("staff");
  return useMemo(() => {
    if (!bedrooms) return null;
    const b = bedrooms.find((x) => x.id === bedroomId);
    if (!b) return undefined;
    const kids = campers.filter((k) => k.bedroom === b.id).sort(byName);
    const people = staff.filter((s) => s.bedroom === b.id).sort(compareRoomStaff);
    const occupied = kids.length + people.length;
    return {
      bedroom: { ...b, occupied, occupiedCampers: kids.length, occupiedStaff: people.length, available: b.capacity - occupied },
      campers: kids,
      staff: people,
    };
  }, [bedrooms, campers, staff, bedroomId]);
}

export function useStaffDetail(staffId: string): StaffDetail | null | undefined {
  const staff = useCollection("staff");
  const campers = useCollectionOrEmpty("campers");
  const bedrooms = useCollectionOrEmpty("bedrooms");
  const events = useCollectionOrEmpty("events");
  const roles = useCollectionOrEmpty("roles");
  const teams = useCollectionOrEmpty("teams");
  return useMemo(() => {
    if (!staff) return null;
    const s = staff.find((x) => x.id === staffId);
    if (!s) return undefined;
    const roleById = new Map(roles.map((r) => [r.id, r]));
    const myTeam = s.team ? teams.find((t) => t.id === s.team) : null;
    const room = s.bedroom ? bedrooms.find((b) => b.id === s.bedroom) : null;

    const schedule: StaffScheduleItem[] = [];
    for (const e of events) {
      // explicit escala wins; otherwise the função that falls on the person's POSITION (active members only)
      const duty = dutyOf(e, s, roleById);
      if (!duty) continue;
      const { role: r, assignment: a } = duty;
      const fallback = s.active ? autoRoleFor(e.roles, s.roomRole, roleById) : undefined;
      schedule.push({
        eventId: e.id,
        date: e.date,
        startTime: e.startTime,
        endTime: e.endTime,
        title: e.title,
        emoji: e.emoji,
        role: r ? { id: r.id, name: r.name, emoji: r.emoji, instructions: r.instructions } : null,
        ...roleDetailOf(r, a, myTeam),
        implicit: !a,
        defaultRole: fallback ? { id: fallback.id, name: fallback.name, emoji: fallback.emoji } : null,
      });
    }
    schedule.sort((x, y) => x.date.localeCompare(y.date) || x.startTime.localeCompare(y.startTime) || x.title.localeCompare(y.title, typeof document !== "undefined" ? document.documentElement.lang || "pt-BR" : "pt-BR"));

    return {
      staff: s,
      bedroom: room ? { id: room.id, name: room.name, group: room.group } : null,
      schedule,
      // a caretaker's OWN kids; a helper: every kid of the room
      campers: s.roomRole === "caretaker" ? campers.filter((k) => k.caretakerId === s.id).sort(byName) : s.bedroom ? campers.filter((k) => k.bedroom === s.bedroom).sort(byName) : [],
      otherCampers: s.roomRole === "caretaker" && s.bedroom ? campers.filter((k) => k.bedroom === s.bedroom && k.caretakerId !== s.id).sort(byName) : [],
      roommates: s.bedroom ? staff.filter((x) => x.bedroom === s.bedroom && x.id !== s.id).sort(compareRoomStaff) : [],
    };
  }, [staff, campers, bedrooms, events, roles, teams, staffId]);
}

export interface MyRoom {
  /** the logged-in person's staff record (same id as the person) */
  me: Staff;
  bedroom: Bedroom | null;
  /** the kids under MY care (Camper.caretakerId === me) — empty for a helper */
  myKids: Camper[];
  /** the OTHER kids of the room the server let me see (only while the camp is happening) */
  campers: Camper[];
  /** other team members in the same room */
  roommates: Staff[];
}

/**
 * The room view for the logged-in team member: `null` while syncing,
 * `undefined` when this person has no staff record in the camp.
 */
export function useMyRoom(personId: string): MyRoom | null | undefined {
  const staff = useCollection("staff");
  const campers = useCollectionOrEmpty("campers");
  const bedrooms = useCollectionOrEmpty("bedrooms");
  return useMemo(() => {
    if (!staff) return null;
    const me = staff.find((s) => s.id === personId);
    if (!me) return undefined;
    const bedroom = me.bedroom ? (bedrooms.find((b) => b.id === me.bedroom) ?? null) : null;
    return {
      me,
      bedroom,
      myKids: campers.filter((k) => k.caretakerId === me.id).sort(byName),
      campers: me.bedroom ? campers.filter((k) => k.bedroom === me.bedroom && k.caretakerId !== me.id).sort(byName) : [],
      roommates: me.bedroom ? staff.filter((s) => s.bedroom === me.bedroom && s.id !== me.id).sort(compareRoomStaff) : [],
    };
  }, [staff, campers, bedrooms, personId]);
}

export interface MyKid {
  camper: Camper;
  bedroom: Bedroom | null;
  /** the team member responsible for the kid (only sent inside the parents' window) */
  caretaker: Staff | null;
  /** the OTHER team members sleeping in the kid's room (only sent inside the parents' window) */
  roomStaff: Staff[];
}

export interface ParentHome {
  kids: MyKid[];
  /** Settings → Contatos, joined to the staff records the server sent (available the whole time the parent has access) */
  contacts: { id: string; title: string; staff: Staff }[];
}

/**
 * The parent's view: their kids (the server only sends the guardian's own
 * kids), each with its room, caretaker and room staff, plus the important
 * contacts. The contacts are sent for as long as the parent may use the app;
 * the kids' ROOM TEAM only while the parents' window is open — outside it
 * those joins simply come back empty. `null` while syncing.
 */
export function useParentHome(): ParentHome | null {
  const campers = useCollection("campers");
  const staff = useCollectionOrEmpty("staff");
  const bedrooms = useCollectionOrEmpty("bedrooms");
  const settings = useCollection("settings");
  return useMemo(() => {
    if (!campers) return null;
    const staffById = new Map(staff.map((s) => [s.id, s]));
    const kids: MyKid[] = [...campers].sort(byName).map((k) => ({
      camper: k,
      bedroom: k.bedroom ? (bedrooms.find((b) => b.id === k.bedroom) ?? null) : null,
      caretaker: k.caretakerId ? (staffById.get(k.caretakerId) ?? null) : null,
      roomStaff: k.bedroom ? staff.filter((s) => s.bedroom === k.bedroom && s.id !== k.caretakerId).sort(compareRoomStaff) : [],
    }));
    const contacts = (settings?.parentContacts ?? []).flatMap((c) => {
      const s = staffById.get(c.personId);
      return s ? [{ id: c.id, title: c.title, staff: s }] : [];
    });
    return { kids, contacts };
  }, [campers, staff, bedrooms, settings]);
}

export interface MyPrepRole {
  role: ScheduleRole;
  /** distinct assignment details across events ("Base 3", "Time Belém"…) */
  details: string[];
  /** how many events the person does this role in */
  eventCount: number;
  /** the moments the person does this role in, in programme order (with that event's detail) */
  events: { id: string; date: string; startTime: string; endTime: string | null; title: string; emoji: string; detail: string }[];
}

/**
 * The roles the logged-in person fulfils in ANY event (their escala, or the
 * função that falls on their position), de-duplicated — what their Preparação page
 * lists. For non-admins the server already scoped the events to their own
 * roles, but the same computation works on the full data an admin receives.
 * `null` while syncing; empty when the person isn't a staff member.
 */
export function useMyPrepRoles(personId: string): MyPrepRole[] | null {
  const staff = useCollection("staff");
  const events = useCollection("events");
  const roles = useCollectionOrEmpty("roles");
  const teams = useCollectionOrEmpty("teams");
  return useMemo(() => {
    if (!staff || !events) return null;
    const me = staff.find((s) => s.id === personId);
    if (!me) return [];
    const roleById = new Map(roles.map((r) => [r.id, r]));
    const myTeam = me.team ? teams.find((t) => t.id === me.team) : null;
    const acc = new Map<string, MyPrepRole>();
    const add = (r: ScheduleRole | undefined, detail: string, e: CampEvent) => {
      if (!r) return;
      const cur = acc.get(r.id) ?? { role: r, details: [], eventCount: 0, events: [] };
      cur.eventCount++;
      if (detail && !cur.details.includes(detail)) cur.details.push(detail);
      cur.events.push({ id: e.id, date: e.date, startTime: e.startTime, endTime: e.endTime, title: e.title, emoji: e.emoji, detail });
      acc.set(r.id, cur);
    };
    const ordered = [...events].sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.title.localeCompare(b.title, typeof document !== "undefined" ? document.documentElement.lang || "pt-BR" : "pt-BR"));
    for (const e of ordered) {
      const a = e.assignments.find((x) => x.staffId === me.id);
      if (a) add(roleById.get(a.roleId), roleDetailOf(roleById.get(a.roleId), a, myTeam).detail, e);
      else if (me.active) for (const id of e.roles) if (autoRoleCovers(roleById.get(id), me.roomRole)) add(roleById.get(id), "", e);
    }
    return [...acc.values()].sort((x, y) => byName(x.role, y.role));
  }, [staff, events, roles, teams, personId]);
}

export function useRoleDetail(roleId: string): RoleDetail | null | undefined {
  const roles = useCollection("roles");
  const events = useCollectionOrEmpty("events");
  const staff = useCollectionOrEmpty("staff");
  const teams = useCollectionOrEmpty("teams");
  return useMemo(() => {
    if (!roles) return null;
    const r = roles.find((x) => x.id === roleId);
    if (!r) return undefined;
    const roleById = new Map(roles.map((x) => [x.id, x]));
    const teamById = new Map(teams.map((t) => [t.id, t]));
    const usedIn = events
      .filter((e) => e.roles.includes(r.id))
      .map((e) => {
        // both links at once: escalados by hand + covered by position
        const people = peopleInRole(e, r, staff, roleById)
          .map(({ staff: s, via, assignment }) => ({
            staffId: s.id,
            name: s.name,
            via,
            detail: roleDetailOf(r, assignment, s.team ? teamById.get(s.team) : null).detail,
          }))
          .sort((a, b) => (a.via === b.via ? byName(a, b) : a.via === "person" ? -1 : 1));
        return { eventId: e.id, date: e.date, startTime: e.startTime, endTime: e.endTime, title: e.title, emoji: e.emoji, people };
      });
    return { role: r, events: usedIn };
  }, [roles, events, staff, teams, roleId]);
}

/** Categories that apply to `audience` (all when omitted) — same as GET /api/categories?audience=. */
export function useCategories(audience?: CategoryAudience): Category[] {
  const all = useCollectionOrEmpty("categories");
  return useMemo(() => (audience ? all.filter((c) => c.appliesTo.includes(audience)) : all), [all, audience]);
}

/** option id → label across every category. */
/** id (a category option, a team OR a transport) → label. Teams and transports are looked up like options so `labelOf(x.team)` / `labelOf(x.transportation)` keep working everywhere. */
export function useLabelOf(): (id: string | null | undefined) => string | null {
  const all = useCollectionOrEmpty("categories");
  const teams = useCollectionOrEmpty("teams");
  const transports = useCollectionOrEmpty("transports");
  return useMemo(() => {
    const map = new Map<string, string>();
    for (const c of all) for (const o of c.options) map.set(o.id, o.label);
    for (const t of teams) map.set(t.id, t.name);
    for (const t of transports) map.set(t.id, t.label);
    return (id: string | null | undefined) => (id ? (map.get(id) ?? null) : null);
  }, [all, teams, transports]);
}

/** transport id → Transport (null when unknown) */
export function useTransportOf(): (id: string | null | undefined) => Transport | null {
  const transports = useCollectionOrEmpty("transports");
  return useMemo(() => {
    const map = new Map(transports.map((t) => [t.id, t]));
    return (id: string | null | undefined) => (id ? (map.get(id) ?? null) : null);
  }, [transports]);
}

/** team id → Team (null when unknown) */
export function useTeamOf(): (id: string | null | undefined) => Team | null {
  const teams = useCollectionOrEmpty("teams");
  return useMemo(() => {
    const map = new Map(teams.map((t) => [t.id, t]));
    return (id: string | null | undefined) => (id ? (map.get(id) ?? null) : null);
  }, [teams]);
}
