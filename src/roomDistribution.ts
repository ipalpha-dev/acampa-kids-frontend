// type-only imports from api/*: nothing of theirs (fetch, localStorage, i18n) may reach the worker bundle
import type { Bedroom, BedroomGroup } from "./api/bedrooms";
import type { Camper } from "./api/campers";
import type { RoomRole, Staff } from "./api/staff";
import { ageOf } from "./age";
import { ROOM_ADULTS, type KidUnit, type PreferenceMap } from "./roomGroups";

/**
 * "Distribuir" — fills the rooms automatically.
 *
 * Pure, synchronous, no React: it runs in a worker (see roomDistribution.worker.ts)
 * that keeps calling `attempt()` with fresh seeds until the deadline, keeping the
 * best plan. Everything here is deterministic for a given seed, so a result can
 * be reproduced.
 *
 * Kids are placed by PREFERENCE GROUP (the same units the board shows): the
 * goal is to keep every group in one room. A group that no room can take whole
 * is SPLIT along its weakest seams (see `splitGroup`) — and the plan remembers
 * which kids had to leave which group, so the board can show it.
 */

// ── input / output ──

export type DistributeWho = "everyone" | "staff" | "kids";
/** how the kids' rooms are picked: everyone by wing, or ONE slice (sex + age range) into the rooms named for it */
export type KidsMode = "auto" | "ages";

/** "girls aged 7-8 go to rooms 101-104": the one slice the `ages` mode places; nobody else is touched */
export interface AgeSlice {
  sex: "F" | "M";
  /** true = every age of that sex; the range below is then ignored (kept so the inputs remember it) */
  allAges: boolean;
  minAge: number;
  maxAge: number;
  roomIds: string[];
}

export interface DistributeInput {
  who: DistributeWho;
  kidsMode: KidsMode;
  /** only read in `ages` mode */
  slice: AgeSlice | null;
  bedrooms: Bedroom[];
  campers: Camper[];
  staff: Staff[];
  /** the preference groups exactly as the board computes them (strategy + limit already applied) */
  units: KidUnit[];
  prefs: PreferenceMap;
  /** kids / staff already placed and to be LEFT ALONE (the admin's manual work) — empty = re-place everyone */
  keepPlaced: boolean;
  /**
   * team members the solver must NOT put in a kids' room: admins and everyone
   * on an admin list (organizers, game organizers, score helpers, medical,
   * vest helpers, photographers, parent contacts). They have other jobs; they
   * go to the staff wing like anyone left over.
   */
  excludeStaffIds: ReadonlySet<string>;
}

export interface PlannedGroup {
  unitId: string;
  /** every kid of the group, in the board's order */
  memberIds: string[];
  /** the room most of the group landed in */
  roomId: string | null;
  /** kids that had to leave that room (empty = the group is intact) */
  movedIds: string[];
}

export interface DistributionPlan {
  campers: Record<string, { bedroom: string | null; caretakerId: string | null }>;
  staff: Record<string, { bedroom: string | null; roomRole: RoomRole }>;
  groups: PlannedGroup[];
  /** kids nobody could place (no room with a free bed in their wing / band) */
  unplacedIds: string[];
  score: PlanScore;
  strategy: string;
  seed: number;
}

export interface PlanScore {
  /** preference groups that ended up in more than one room (lower is better) */
  brokenGroups: number;
  /** kids that had to leave their group's room */
  movedKids: number;
  /** kids left without a room */
  unplaced: number;
  /** rooms with kids but no líder (lower is better) */
  leaderless: number;
  /** rooms whose kids are more than MAX_AGE_GAP years apart (lower is better) */
  ageMixed: number;
  /** kids sleeping past a room's kid beds (an age-compatible room was overflowed rather than mixing ages) */
  overflow: number;
}

/**
 * Kids in one room should be close in age: past this many years apart the
 * room is "mixed", and the solver would rather overflow an age-compatible
 * room than put them together.
 */
export const MAX_AGE_GAP = 2;
/** how many kids past its beds a room may take before mixing ages becomes the lesser evil */
export const MAX_OVERFLOW = 2;

/**
 * Nothing left to improve: every kid placed, every group whole, no room
 * over its beds or mixing ages, and — when there were líderes to place —
 * every kids' room has one. A plan like this ends the search at once.
 */
export function isPerfect(s: PlanScore, leadersAvailable: boolean): boolean {
  return s.unplaced === 0 && s.brokenGroups === 0 && s.movedKids === 0 && s.ageMixed === 0 && s.overflow === 0 && (!leadersAvailable || s.leaderless === 0);
}

/** a < b when a is the better plan */
export function betterScore(a: PlanScore, b: PlanScore): boolean {
  if (a.unplaced !== b.unplaced) return a.unplaced < b.unplaced;
  if (a.brokenGroups !== b.brokenGroups) return a.brokenGroups < b.brokenGroups;
  if (a.ageMixed !== b.ageMixed) return a.ageMixed < b.ageMixed;
  if (a.movedKids !== b.movedKids) return a.movedKids < b.movedKids;
  if (a.overflow !== b.overflow) return a.overflow < b.overflow;
  return a.leaderless < b.leaderless;
}

// ── seeded random (mulberry32) so a plan can be replayed ──

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(list: T[], rand: () => number): T[] {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ── helpers ──

const wingOf = (k: Camper): BedroomGroup | null => {
  const sex = k.sex;
  return sex === "F" ? "girls" : sex === "M" ? "boys" : null;
};

/** beds a room keeps for the team — never fewer than one líder */
function kidBeds(room: Bedroom): number {
  return Math.max(0, room.capacity - ROOM_ADULTS);
}

/** is this kid the sex + age the slice is about? */
function inSlice(k: Camper, s: AgeSlice): boolean {
  if ((k.sex) !== s.sex) return false;
  if (s.allAges) return true;
  const age = ageOf(k.birthDate ?? null);
  return age !== null && age >= s.minAge && age <= s.maxAge;
}

/**
 * How tightly two kids are tied inside a group:
 *  2 = they name each other (cross-referenced) — never separate if at all possible
 *  1 = one names the other
 *  0 = no direct link (glued through a third kid)
 */
function tie(a: string, b: string, prefs: PreferenceMap): number {
  const ab = (prefs.get(a) ?? []).some((p) => p.camperId === b);
  const ba = (prefs.get(b) ?? []).some((p) => p.camperId === a);
  return ab && ba ? 2 : ab || ba ? 1 : 0;
}

/**
 * Splits a group that does not fit in `size` beds into a "core" that stays
 * and the kids that leave, cutting the WEAKEST ties first:
 *  1. kids with no mutual link leave before cross-referenced pairs are touched;
 *  2. among those, the kid whose departure breaks the fewest links goes first;
 *  3. the core keeps cross-referenced kids; if a pair must still be split,
 *     the pair with fewer OTHER kids asking for them is split first.
 */
export function splitGroup(memberIds: string[], size: number, prefs: PreferenceMap): { stay: string[]; leave: string[] } {
  if (memberIds.length <= size) return { stay: memberIds.slice(), leave: [] };
  const stay = memberIds.slice();
  const leave: string[] = [];
  const linksOf = (id: string, pool: string[]) => pool.filter((o) => o !== id).reduce((n, o) => n + tie(id, o, prefs), 0);
  const mutualOf = (id: string, pool: string[]) => pool.filter((o) => o !== id && tie(id, o, prefs) === 2).length;
  const wantedBy = (id: string, pool: string[]) => pool.filter((o) => o !== id && (prefs.get(o) ?? []).some((p) => p.camperId === id)).length;
  while (stay.length > size) {
    // rank candidates: fewest mutual links, then fewest links at all, then least wanted by others
    const ranked = stay
      .map((id) => ({ id, mutual: mutualOf(id, stay), links: linksOf(id, stay), wanted: wantedBy(id, stay) }))
      .sort((a, b) => a.mutual - b.mutual || a.links - b.links || a.wanted - b.wanted || a.id.localeCompare(b.id));
    const out = ranked[0].id;
    stay.splice(stay.indexOf(out), 1);
    leave.push(out);
  }
  return { stay, leave };
}

// ── the solver ──

/** a room being filled */
interface Slot {
  room: Bedroom;
  kidIds: string[];
  staffIds: string[];
  free: number;
}

export const STRATEGIES = ["biggest-first", "smallest-first", "best-fit", "random"] as const;
export type Strategy = (typeof STRATEGIES)[number];

/**
 * One attempt with one strategy and one seed. Returns a complete plan.
 * The caller (worker) loops strategies × seeds until the deadline.
 */
export function attempt(input: DistributeInput, strategy: Strategy, seed: number): DistributionPlan {
  const rand = rng(seed);
  const { bedrooms, campers, staff, units, prefs, slice } = input;
  const placeKids = input.who !== "staff";
  const placeStaff = input.who !== "kids";
  const camperById = new Map(campers.map((k) => [k.id, k]));

  const plan: DistributionPlan = { campers: {}, staff: {}, groups: [], unplacedIds: [], score: { brokenGroups: 0, movedKids: 0, unplaced: 0, leaderless: 0, ageMixed: 0, overflow: 0 }, strategy, seed };

  // rooms start as the board leaves them when the admin asked to keep manual work; empty otherwise
  const slots = new Map<string, Slot>();
  for (const room of bedrooms) slots.set(room.id, { room, kidIds: [], staffIds: [], free: room.capacity });
  const keep = (k: { bedroom: string | null }) => input.keepPlaced && !!k.bedroom && slots.has(k.bedroom);

  for (const s of staff) {
    if (!s.active) continue;
    if (keep(s) || !placeStaff) {
      if (s.bedroom && slots.has(s.bedroom)) {
        const slot = slots.get(s.bedroom)!;
        slot.staffIds.push(s.id);
        slot.free--;
      }
      plan.staff[s.id] = { bedroom: s.bedroom, roomRole: s.roomRole };
    }
  }
  for (const k of campers) {
    if (keep(k) || !placeKids) {
      if (k.bedroom && slots.has(k.bedroom)) {
        const slot = slots.get(k.bedroom)!;
        slot.kidIds.push(k.id);
        slot.free--;
      }
      plan.campers[k.id] = { bedroom: k.bedroom, caretakerId: k.caretakerId };
    }
  }

  // ── staff: one líder per kids' room first, then auxiliares, then the staff wing ──
  // Roles are never changed here: a líder stays a líder, an auxiliar an auxiliar.
  // People with another job (admin lists) skip the kids' rooms altogether.
  if (placeStaff) {
    const movable = staff.filter((s) => s.active && !(s.id in plan.staff));
    const forRooms = movable.filter((s) => !input.excludeStaffIds.has(s.id));
    const busy = movable.filter((s) => input.excludeStaffIds.has(s.id));
    const bySex = (g: BedroomGroup) => (s: Staff) => {
      const sex = s.sex;
      return g === "girls" ? sex !== "M" : g === "boys" ? sex !== "F" : true;
    };
    const kidRooms = shuffle(bedrooms.filter((b) => b.group !== "staff"), rand);
    const leaders = shuffle(forRooms.filter((s) => s.roomRole === "caretaker"), rand);
    const helpers = shuffle(forRooms.filter((s) => s.roomRole === "helper"), rand);
    const take = (pool: Staff[], room: Bedroom) => {
      const i = pool.findIndex(bySex(room.group));
      if (i < 0) return false;
      const s = pool.splice(i, 1)[0];
      const slot = slots.get(room.id)!;
      slot.staffIds.push(s.id);
      slot.free--;
      plan.staff[s.id] = { bedroom: room.id, roomRole: s.roomRole };
      return true;
    };
    // every kids' room gets a líder — only a real one; when they run out the room stays leaderless (scored)
    for (const room of kidRooms) {
      const slot = slots.get(room.id)!;
      const hasLeader = slot.staffIds.some((id) => (plan.staff[id]?.roomRole ?? staff.find((s) => s.id === id)?.roomRole) === "caretaker");
      if (hasLeader || slot.free <= 0) continue;
      take(leaders, room);
    }
    // then one auxiliar per room, biggest rooms first (they need the help most)
    for (const room of kidRooms.slice().sort((a, b) => b.capacity - a.capacity)) {
      const slot = slots.get(room.id)!;
      if (slot.free <= 0 || slot.staffIds.length >= ROOM_ADULTS) continue;
      take(helpers, room);
    }
    // whoever is left — spare líderes / auxiliares and the people with other jobs — goes to the staff wing, then to any bed
    const rest = [...leaders, ...helpers, ...busy];
    const staffRooms = bedrooms.filter((b) => b.group === "staff");
    for (const s of rest) {
      const room = [...staffRooms, ...kidRooms].find((r) => slots.get(r.id)!.free > 0 && bySex(r.group)(s));
      if (!room) { plan.staff[s.id] = { bedroom: null, roomRole: s.roomRole }; continue; }
      const slot = slots.get(room.id)!;
      slot.staffIds.push(s.id);
      slot.free--;
      plan.staff[s.id] = { bedroom: room.id, roomRole: s.roomRole };
    }
  }

  // ── kids: groups into rooms ──
  if (placeKids) {
    // `ages` mode: only the slice moves; everyone else keeps whatever they have
    const sliced = input.kidsMode === "ages" && slice;
    if (sliced) for (const k of campers) if (!(k.id in plan.campers) && !inSlice(k, slice)) plan.campers[k.id] = { bedroom: k.bedroom, caretakerId: k.caretakerId };
    const movableIds = new Set(campers.filter((k) => !(k.id in plan.campers)).map((k) => k.id));
    // groups restricted to the kids we may move, biggest first (they are the hardest to fit)
    let groups = units
      .map((u) => ({ unitId: u.id, memberIds: u.members.map((k) => k.id).filter((id) => movableIds.has(id)) }))
      .filter((g) => g.memberIds.length > 0);
    groups = strategy === "random" ? shuffle(groups, rand) : groups.sort((a, b) => b.memberIds.length - a.memberIds.length || (rand() < 0.5 ? -1 : 1));

    /** rooms a kid may sleep in: their wing — or, in `ages` mode, exactly the rooms picked for the slice */
    const roomsFor = (k: Camper): Slot[] => {
      const wing = wingOf(k);
      return [...slots.values()].filter((s) => {
        if (s.room.group === "staff") return false;
        if (sliced) return slice.roomIds.includes(s.room.id);
        return !wing || s.room.group === wing;
      });
    };
    /** free KID beds: what is left in the room, never eating into the beds kept for the team */
    const kidFree = (s: Slot) => Math.max(0, Math.min(s.free, kidBeds(s.room) - s.kidIds.length));
    const ageOfId = (id: string) => ageOf(camperById.get(id)?.birthDate ?? null);
    /** the ages already sleeping in the room (kids of unknown age don't constrain) */
    const roomAges = (s: Slot) => s.kidIds.map(ageOfId).filter((a): a is number => a !== null);
    /**
     * Would these kids sit within MAX_AGE_GAP of everyone already in the room?
     * An empty room (or one of unknown ages) welcomes anyone.
     */
    const ageFits = (s: Slot, ids: string[]) => {
      const mine = ids.map(ageOfId).filter((a): a is number => a !== null);
      const theirs = roomAges(s);
      if (!mine.length || !theirs.length) return true;
      const lo = Math.min(...mine, ...theirs);
      const hi = Math.max(...mine, ...theirs);
      return hi - lo <= MAX_AGE_GAP;
    };
    /**
     * Rooms for a group, best first. Age-compatible rooms come before mixed
     * ones no matter what; inside each tier the strategy orders by free beds.
     * When no compatible room has a bed left, a compatible room is still
     * offered (it will overflow) — a bigger room over a mixed one.
     */
    const orderRooms = (list: Slot[], ids: string[]) => {
      const need = ids.length;
      const byStrategy = (pool: Slot[]) => {
        switch (strategy) {
          case "biggest-first": return pool.sort((a, b) => kidFree(b) - kidFree(a));
          case "smallest-first": return pool.sort((a, b) => kidFree(a) - kidFree(b));
          case "best-fit": return pool.sort((a, b) => Math.abs(kidFree(a) - need) - Math.abs(kidFree(b) - need));
          default: return shuffle(pool, rand);
        }
      };
      const compatible = list.filter((s) => ageFits(s, ids));
      const mixed = list.filter((s) => !ageFits(s, ids));
      const tier = (pool: Slot[]) => {
        const fits = pool.filter((s) => kidFree(s) >= need);
        const some = pool.filter((s) => kidFree(s) > 0 && kidFree(s) < need);
        return [...byStrategy(fits), ...byStrategy(some)];
      };
      // compatible with beds → compatible but full, overflowed by at most MAX_OVERFLOW (least-full first)
      // → mixed with beds → anything compatible, however full (better a crowded room than nowhere)
      const over = (s: Slot) => s.kidIds.length - kidBeds(s.room);
      const full = compatible.filter((s) => kidFree(s) === 0).sort((a, b) => over(a) - over(b));
      const gently = full.filter((s) => over(s) < MAX_OVERFLOW);
      const heavily = full.filter((s) => over(s) >= MAX_OVERFLOW);
      // last resort: a mixed room that is full — still better than leaving kids without a bed
      const mixedFull = mixed.filter((s) => kidFree(s) === 0).sort((a, b) => over(a) - over(b));
      return [...tier(compatible), ...gently, ...tier(mixed), ...heavily, ...mixedFull];
    };
    /**
     * How many of `ids` this room takes: its free beds; a full room takes up
     * to MAX_OVERFLOW past its beds; a room already past that (last resort)
     * takes the whole lot rather than leave anyone unplaced.
     */
    const roomTakes = (s: Slot, ids: string[]) => {
      if (kidFree(s) > 0) return kidFree(s);
      const room = MAX_OVERFLOW - (s.kidIds.length - kidBeds(s.room));
      return room > 0 ? Math.min(room, ids.length) : ids.length;
    };
    const put = (id: string, slot: Slot) => {
      slot.kidIds.push(id);
      slot.free--;
      const leader = slot.staffIds.find((sid) => (plan.staff[sid]?.roomRole ?? staff.find((s) => s.id === sid)?.roomRole) === "caretaker") ?? null;
      plan.campers[id] = { bedroom: slot.room.id, caretakerId: leader };
    };

    for (const g of groups) {
      const first = camperById.get(g.memberIds[0])!;
      const rooms = orderRooms(roomsFor(first), g.memberIds);
      const planned: PlannedGroup = { unitId: g.unitId, memberIds: g.memberIds, roomId: null, movedIds: [] };
      let remaining = g.memberIds.slice();
      // the first room takes the core (the whole group when it fits), the rest is split off
      const target = rooms[0];
      if (target) {
        const { stay, leave } = splitGroup(remaining, roomTakes(target, remaining), prefs);
        for (const id of stay) put(id, target);
        planned.roomId = target.room.id;
        remaining = leave;
      }
      // the split-off kids: keep THEM together where possible, wherever there is room
      while (remaining.length) {
        const k = camperById.get(remaining[0])!;
        const next = orderRooms(roomsFor(k), remaining)[0];
        if (!next) { plan.unplacedIds.push(...remaining); planned.movedIds.push(...remaining); break; }
        const { stay, leave } = splitGroup(remaining, roomTakes(next, remaining), prefs);
        for (const id of stay) { put(id, next); planned.movedIds.push(id); }
        remaining = leave;
      }
      plan.groups.push(planned);
    }
    for (const id of plan.unplacedIds) plan.campers[id] = { bedroom: null, caretakerId: null };
  }

  // ── score ──
  plan.score.brokenGroups = plan.groups.filter((g) => g.memberIds.length > 1 && g.movedIds.length > 0).length;
  plan.score.movedKids = plan.groups.reduce((n, g) => n + g.movedIds.length, 0);
  plan.score.unplaced = plan.unplacedIds.length;
  plan.score.leaderless = [...slots.values()].filter((s) => s.kidIds.length > 0 && !s.kidIds.some((id) => plan.campers[id]?.caretakerId)).length;
  for (const s of slots.values()) {
    const ages = s.kidIds.map((id) => ageOf(camperById.get(id)?.birthDate ?? null)).filter((a): a is number => a !== null);
    if (ages.length > 1 && Math.max(...ages) - Math.min(...ages) > MAX_AGE_GAP) plan.score.ageMixed++;
    plan.score.overflow += Math.max(0, s.kidIds.length - kidBeds(s.room));
  }
  return plan;
}

/**
 * Runs attempts until `deadlineMs`, keeping the best — and stops the moment a
 * plan has nothing left to improve (`isPerfect`): more tries can't beat it.
 * `onProgress` fires every few attempts so a UI can show it is still working.
 */
export function solve(input: DistributeInput, deadlineMs: number, onProgress?: (best: DistributionPlan, attempts: number) => void): DistributionPlan {
  // "every room has a líder" is only a requirement when there are líderes to give out;
  // with none on the roster (or staff not being placed) it can never be met and must not keep us searching
  const leadersAvailable = input.who !== "kids" && input.staff.some((s) => s.active && s.roomRole === "caretaker" && !input.excludeStaffIds.has(s.id));
  let best: DistributionPlan | null = null;
  let attempts = 0;
  let seed = 1;
  const start = Date.now();
  while (Date.now() - start < deadlineMs) {
    for (const strategy of STRATEGIES) {
      const plan = attempt(input, strategy, seed++);
      attempts++;
      if (!best || betterScore(plan.score, best.score)) best = plan;
      if (isPerfect(best.score, leadersAvailable)) return best;
      // staff-only: the rooms are decided by the roster, not by luck — a handful of seeds is all the variety there is
      if (input.who === "staff" && attempts >= STRATEGIES.length * 4) return best;
      if (attempts % 8 === 0) onProgress?.(best, attempts);
      if (Date.now() - start >= deadlineMs) break;
    }
  }
  return best!;
}
