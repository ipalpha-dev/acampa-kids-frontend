import type { Camper } from "./api/campers";
import type { Bedroom } from "./api/bedrooms";

/** lowercase, accent-free, single-spaced comparison form of a name. */
export function normName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** one name of the preference field, with whatever the parents added in parentheses kept aside */
export interface PrefName {
  /** the name used for matching ("Helena Cima") */
  name: string;
  /** the remark in parentheses, if any ("irmã", "não sabe o sobrenome, sala Lídia") — never matched, always shown */
  note: string;
}

/**
 * The names of a kid's "prefere dividir quarto com" field. Parents write the
 * list however they like: "Ana, Bruno e Carla" / "Ana; Bruno" / "Ana e Bruno".
 * Anything in parentheses is a remark, not a name ("Helena Cima (irmã)",
 * "Eloah (não sabe o sobrenome, sala Lídia)"): it is lifted out before the
 * split — so a comma inside it never cuts a name in two — and handed back as
 * the entry's `note`. A " · " tail is the bed note the import appends
 * ("… · só cama de baixo"): not a name, dropped.
 */
export function parsePreference(pref: string): PrefName[] {
  const notes: string[] = [];
  const withMarkers = pref
    .replace(/\s*·.*$/s, "")
    .replace(/\s*[(\[]([^)\]]*)[)\]]/g, (_m, inner: string) => {
      notes.push(inner.trim());
      return ` \u0000${notes.length - 1}\u0000`;
    });
  return withMarkers
    .split(/\s*[,;/]\s*|\s+e\s+|\s+&\s+/i)
    .map((part) => {
      const found: string[] = [];
      const name = part.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => {
        found.push(notes[Number(i)]);
        return "";
      }).replace(/\s+/g, " ").trim();
      return { name, note: found.filter(Boolean).join("; ") };
    })
    .filter((p) => p.name);
}

/**
 * Does the preference name `pref` point at a kid called `name`?
 * — one word  → compares with the FIRST name
 * — two words → first + LAST name, or first + SECOND name
 */
export function prefNameMatches(pref: string, name: string): boolean {
  const p = normName(pref).split(" ").filter(Boolean);
  const n = normName(name).split(" ").filter(Boolean);
  if (p.length === 0 || n.length === 0) return false;
  if (p.length === 1) return n[0] === p[0];
  const [first, second] = p;
  return n[0] === first && ((n.length > 1 && n[n.length - 1] === second) || n[1] === second);
}

/** One name of the preference field, resolved against the kids on the roster. */
export interface PrefMatch {
  /** the name as typed on the enrolment, without the parenthetical remark */
  raw: string;
  /** the parents' remark in parentheses ("irmã", "da mesma sala") — shown, never matched */
  note: string;
  /** the kid it points at (null = nobody matched → the admin sees a red chip) */
  camperId: string | null;
  /**
   * true when the name was a single first name that fits SEVERAL kids: it is
   * left unmatched (`camperId` null) so the admin resolves it, instead of
   * silently gluing the kid to whichever namesake came first on the roster
   */
  ambiguous?: boolean;
  /** the name was a lone first name (weak evidence: it only glues when reciprocated) */
  firstNameOnly: boolean;
}

/**
 * Resolve every comma-separated name of `kid`'s preference against `others`.
 * A full name (two+ words) resolves to the one kid it fits. A lone first name
 * resolves only when exactly one kid on the roster has it — with two or more
 * namesakes it stays unmatched and flagged `ambiguous`.
 */
export function matchPreferences(kid: Camper, others: readonly Camper[]): PrefMatch[] {
  return parsePreference(kid.bedroomPreference).map(({ name: raw, note }) => {
    const firstNameOnly = normName(raw).split(" ").filter(Boolean).length === 1;
    const hits = others.filter((k) => prefNameMatches(raw, k.name));
    if (hits.length === 1) return { raw, note, camperId: hits[0].id, firstNameOnly };
    if (hits.length > 1 && firstNameOnly) return { raw, note, camperId: null, ambiguous: true, firstNameOnly };
    // several kids fit a full name (twins with the same name?) — keep the old "first wins" behaviour
    return { raw, note, camperId: hits[0]?.id ?? null, firstNameOnly };
  });
}

/** kidId → resolved preference entries (empty when the kid asked for nobody). */
export type PreferenceMap = Map<string, PrefMatch[]>;

export function matchAllPreferences(kids: readonly Camper[]): PreferenceMap {
  const map: PreferenceMap = new Map();
  for (const k of kids) map.set(k.id, matchPreferences(k, kids.filter((o) => o.id !== k.id)));
  return map;
}

/** A "stuck together" unit: kids linked by their preference names (either direction). */
export interface KidUnit {
  /** stable id: the smallest member id */
  id: string;
  members: Camper[];
}

/**
 * Does `a`'s preference entry pointing at `b` count as a real link?
 *  • a full name (two+ words) always does;
 *  • a lone first name only when `b` also names `a` back (reciprocal) — a
 *    one-way "Helena" is a hint for the tooltip, not enough to weld two
 *    clusters together through a common first name.
 */
function strongLink(a: Camper, entry: PrefMatch, prefs: PreferenceMap): boolean {
  if (!entry.camperId) return false;
  if (!entry.firstNameOnly) return true;
  return (prefs.get(entry.camperId) ?? []).some((back) => back.camperId === a.id);
}

/** Union-find over `kids`: every resolved preference link (soft) or only the strong ones (strict). */
function cluster(kids: readonly Camper[], prefs: PreferenceMap, strict: boolean): KidUnit[] {
  const byId = new Map(kids.map((k) => [k.id, k]));
  const parent = new Map<string, string>(kids.map((k) => [k.id, k.id]));
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root)! !== root) root = parent.get(root)!;
    return root;
  };
  const union = (a: string, b: string) => {
    const [ra, rb] = [find(a), find(b)];
    if (ra === rb) return;
    // smaller id becomes the root, so a cluster keeps its id when members move
    if (ra < rb) parent.set(rb, ra);
    else parent.set(ra, rb);
  };
  for (const k of kids) {
    for (const p of prefs.get(k.id) ?? []) {
      // links leaving this slice of kids are ignored (matters on the strict re-run of one blob)
      if (!p.camperId || !byId.has(p.camperId)) continue;
      if (!strict || strongLink(k, p, prefs)) union(k.id, p.camperId);
    }
  }
  const groups = new Map<string, Camper[]>();
  for (const k of kids) {
    const root = find(k.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(k);
  }
  return [...groups.values()].map((members) => ({
    id: members.reduce((min, k) => (k.id < min ? k.id : min), members[0].id),
    members: members.slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
  }));
}

/** Fallback "a room's worth of kids" when a wing has no rooms yet. */
export const DEFAULT_BLOB_LIMIT = 6;
/** beds a room keeps for the team: a líder and (usually) an auxiliar */
export const ROOM_ADULTS = 2;

/**
 * How preference names glue kids together:
 *  • smart  — loose links, then any group bigger than a room is re-linked strictly (default)
 *  • strict — only full names or reciprocated first names, everywhere
 *  • loose  — every resolved name glues, no size check
 */
export type PreferenceStrategy = "smart" | "strict" | "loose";

export interface GroupingOptions {
  strategy?: PreferenceStrategy;
  /** smart only: a fixed group-size limit for every wing (null / undefined = the wing's big room, see `blobLimitOf`) */
  limit?: number | null;
}

/** "meninas 5 · meninos 12" — what the limit works out to for each wing (for the Limite label) */
export function blobLimitHint(bedrooms: readonly Bedroom[]): string {
  const girls = blobLimitOf({ sex: "F" }, bedrooms);
  const boys = blobLimitOf({ sex: "M" }, bedrooms);
  return girls === boys ? String(girls) : `meninas ${girls} · meninos ${boys}`;
}

/**
 * A room size only counts as "the wing's big room" when the wing has enough
 * of them: at least this share of its rooms, and never fewer than two. One
 * freak dorm among small rooms must not lift the limit for everybody.
 */
const BIG_ROOM_SHARE = 0.2;

/**
 * How many kids a group may hold before it looks wrong: the beds of the
 * LARGEST room of the wing (girls / boys) that the wing actually has a few of
 * (see `BIG_ROOM_SHARE`), MINUS the beds kept for the líder and the auxiliar.
 * The question is existential — is there a room this group fits in? — so a
 * wing split in two corridors (4×7 + 6×14) rightly answers 14 → 12, where a
 * median or percentile would say 7 → 5.
 */
export function blobLimitOf(kid: Pick<Camper, "sex">, bedrooms: readonly Bedroom[]): number {
  const sex = kid.sex;
  const wing = sex === "F" ? "girls" : sex === "M" ? "boys" : null;
  const caps = bedrooms.filter((b) => wing ? b.group === wing : b.group !== "staff").map((b) => b.capacity).sort((a, b) => b - a);
  if (!caps.length) return DEFAULT_BLOB_LIMIT;
  const need = Math.max(2, Math.ceil(caps.length * BIG_ROOM_SHARE));
  // largest size that appears at least `need` times; a wing of one or two rooms simply takes its largest
  const big = caps.length < need ? caps[0] : caps.find((c) => caps.filter((x) => x === c).length >= need) ?? caps[caps.length - 1];
  return Math.max(2, big - ROOM_ADULTS);
}

/**
 * Likely room groups: kids whose preference names match each other end up in
 * the same unit, so they can be dragged into a room in one go. Single kids
 * (nobody matched, or nobody asked for them) come back as one-member units.
 *
 * Two passes:
 *  1. SOFT — every resolved link glues, one-way first names included (a
 *     lone "Cecília" naming the only Cecília on the roster is a real wish);
 *  2. any unit bigger than its wing's room (`blobLimitOf`) is re-clustered
 *     STRICT on its own members — full names or reciprocated first names only
 *     — because a group that can't fit one room was welded by loose links.
 * Small units keep every hint; a blob only ever gets smaller.
 */
export function buildUnits(kids: readonly Camper[], prefs: PreferenceMap, bedrooms: readonly Bedroom[] = [], options: GroupingOptions = {}): KidUnit[] {
  const strategy = options.strategy ?? "smart";
  if (strategy === "strict") return cluster(kids, prefs, true);
  const soft = cluster(kids, prefs, false);
  if (strategy === "loose") return soft;
  return soft.flatMap((unit) => {
    const limit = options.limit ?? blobLimitOf(unit.members[0], bedrooms);
    return unit.members.length > limit ? cluster(unit.members, prefs, true) : [unit];
  });
}

export interface PreferenceGroupAdjustments {
  /** preference clusters deliberately broken apart */
  ungrouped?: ReadonlySet<string>;
  /** individual campers pulled out of their original cluster */
  detached?: ReadonlySet<string>;
  /** camper id → camper/unit it was manually joined to */
  glued?: ReadonlyMap<string, string>;
}

/**
 * Shared grouping used by Montar quartos and Montar times. It starts from the
 * deterministic bedroom-preference clusters, then applies the room board's
 * optional manual split/join gestures. Without adjustments it is exactly the
 * automatic preference grouping used by the teams board.
 */
export function buildPreferenceUnits(kids: readonly Camper[], prefs: PreferenceMap, adjustments: PreferenceGroupAdjustments = {}, bedrooms: readonly Bedroom[] = [], options: GroupingOptions = {}): KidUnit[] {
  const { ungrouped = new Set<string>(), detached = new Set<string>(), glued = new Map<string, string>() } = adjustments;
  const single = (kid: Camper): KidUnit => ({ id: kid.id, members: [kid] });
  const base = buildUnits(kids, prefs, bedrooms, options).flatMap((unit) => {
    if (ungrouped.has(unit.id)) return unit.members.map(single);
    const stay = unit.members.filter((kid) => !detached.has(kid.id));
    const left = unit.members.filter((kid) => detached.has(kid.id)).map(single);
    if (!stay.length) return left;
    return [{ id: stay.reduce((min, kid) => kid.id < min ? kid.id : min, stay[0].id), members: stay }, ...left];
  });
  if (!glued.size) return base;

  const keyOf = new Map<string, string>();
  for (const unit of base) for (const member of unit.members) keyOf.set(member.id, unit.id);
  for (const [kidId, target] of glued) {
    const from = keyOf.get(kidId);
    const to = keyOf.get(target);
    if (!from || !to || from === to) continue;
    for (const [id, key] of keyOf) if (key === from) keyOf.set(id, to);
  }
  const merged = new Map<string, Camper[]>();
  for (const unit of base) for (const member of unit.members) {
    const key = keyOf.get(member.id) ?? unit.id;
    merged.set(key, [...(merged.get(key) ?? []), member]);
  }
  return [...merged.values()].map((members) => ({
    id: members.reduce((min, kid) => kid.id < min ? kid.id : min, members[0].id),
    members: members.slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
  }));
}

/** Keeps the global preference clusters but shows only members present in one board zone. */
export function preferenceUnitsIn(units: readonly KidUnit[], campers: readonly Camper[]): KidUnit[] {
  const visible = new Set(campers.map((camper) => camper.id));
  return units.flatMap((unit) => {
    const members = unit.members.filter((member) => visible.has(member.id));
    return members.length ? [{ id: unit.id, members }] : [];
  });
}
