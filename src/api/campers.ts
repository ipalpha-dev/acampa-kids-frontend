import { ApiError, api, command } from "./client";
import { bearer } from "../auth/store";
import type { Staff } from "./staff";

/** Category keys that feed each camper field (must match the backend). */
export const CAMPER_CATEGORY_KEYS = {
  bed: "cama",
  allergies: "alergias",
  drugAllergies: "alergia-medicamentos",
  healthIssues: "condicao-cronica",
} as const;

/**
 * A kid's camp-ops record (participants, CONTRACTS_ACAMPA §15). The id IS the
 * IPAlpha person id. No person data lives here: the name / nickname / sex
 * come live from core (joined by the store from the people cache), health is
 * read per person on demand (GET /api/campers/:id) or in a filtered list.
 */
export interface CamperRecord {
  /** the IPAlpha person id */
  id: string;
  personId: string;
  /** true when the server sent a NAME-ONLY record (bus helper roll call): no notes */
  redacted?: boolean;
  /** true when the server sent a CARE record (room caretaker / helper): no invitedBy / badge token */
  contactsHidden?: boolean;
  /** who invited the kid */
  invitedBy: string;
  /** person id of the team member responsible for the kid (a caretaker of the kid's room); null = orphan */
  caretakerId: string | null;
  /** token printed on the QR badge */
  qrToken: string;
  team: string | null;
  /** Transport id (see api/transports.ts) — bus / car, not a category option */
  transportation: string | null;
  /** category option id (cima / baixo) */
  bed: string | null;
  bedroom: string | null;
  generalNotes: string;
  /** who the kid would like to share the room with */
  bedroomPreference: string;
  /** set once the kid arrived at the church and the parent confirmed the registration data */
  checkin: CamperCheckin | null;
  /** set once the kid boarded the bus going to camp */
  busCheckin: CamperCheckin | null;
  /** set once the kid boarded the bus returning to church */
  busReturnCheckin: CamperCheckin | null;
  createdAt: string;
  /** ISO — when a responsável last edited the kid's health / notes; null until they do */
  parentEditedAt: string | null;
  importId: string | null;
  updatedAt: string;
}

/** The health block (persons-api `medical`, read with the acting role token — core's role rules decide). */
export interface HealthInfo {
  allergies: string[];
  drugAllergies: string[];
  healthIssues: string[];
  /** TEA, TDAH… */
  neurodivergent: boolean;
  /** medicines the person takes, each with its schedule (drives the medical checklist) */
  medications: Medication[];
  foodRestrictions: string;
  healthNotes: string;
  /** kilograms (one decimal) or null */
  weightKg: number | null;
  insurance: string;
  insuranceCard: string;
}

export const EMPTY_HEALTH: HealthInfo = { allergies: [], drugAllergies: [], healthIssues: [], neurodivergent: false, medications: [], foodRestrictions: "", healthNotes: "", weightKg: null, insurance: "", insuranceCard: "" };

/** The person fields read live from core with the name (decision 39: sex is shown like the name). */
export interface PersonLive {
  /** "" while not known yet (offline, or still loading) */
  name: string;
  nickname: string | null;
  sex: CamperSex | null;
  /** neutral ♥ — only for roles allowed health; never says what */
  hasHealth?: boolean;
  /** health details: only on the person page, a health-tag filter or a name filter with ≤ 6 results */
  health?: HealthInfo | null;
  /**
   * IPAlpha refused this role's read of the kid's health (403 — e.g. a
   * responsável whose link to the kid is not confirmed in IPAlpha yet). The
   * screen says "not available for your profile", never "nothing informed".
   */
  healthForbidden?: boolean;
  /**
   * Not served to Acampa today (decision 39 keeps the birth date out of the
   * names read): ages are unknown, so age-based helpers (room distribution,
   * birthdays) simply skip it. Kept optional so a future read can fill it.
   */
  birthDate?: string | null;
}

/** What screens read: the camp-ops record + the live person fields. */
export interface Camper extends CamperRecord, PersonLive {}

export type CamperSex = "F" | "M";

/**
 * One medicine: fixed "HH:MM" `times` (the medical team ticks each one) or
 * `asNeeded` (no fixed time). Neither = schedule not informed yet.
 */
export interface Medication {
  name: string;
  dose: string;
  times: string[];
  asNeeded: boolean;
  notes: string;
}

export const blankMedication = (): Medication => ({ name: "", dose: "", times: [], asNeeded: false, notes: "" });

/** "Ritalina 10mg · 08:30, 12:30 · junto com o café" — one line per medicine */
export function medicationLine(m: Medication): string {
  const when = m.asNeeded ? "quando necessário" : m.times.length ? m.times.join(", ") : "horário a confirmar";
  return [[m.name, m.dose].filter(Boolean).join(" "), when, m.notes].filter(Boolean).join(" · ");
}

export function medicationsText(list: Medication[]): string {
  return list.map(medicationLine).join("\n");
}

export interface CamperCheckin {
  at: string;
  /** who did it (person id — name read live) */
  byPersonId: string;
  /** the acting role key */
  byRole: string;
  /** set when nobody did it by hand — e.g. the system checked the kid in when their wristband scored points */
  note?: string;
}

/** Camp-ops fields the coordenação / organização may write (PUT /api/campers/:id). */
export type CamperOpsInput = Partial<Pick<CamperRecord, "team" | "transportation" | "bed" | "bedroom" | "caretakerId" | "invitedBy" | "qrToken" | "generalNotes" | "bedroomPreference">>;

/** One responsável of a kid (ids + live name). */
export interface Responsible {
  personId: string;
  name: string;
}

export interface CamperDetail {
  camper: Camper;
  bedroom: { id: string; name: string; group: "girls" | "boys" | "staff" } | null;
  /** the team member responsible for the kid (null = orphan, or not visible to the viewer) */
  caretaker: Staff | null;
  /** staff sleeping in the same room (caretakers and helpers) */
  caretakers: Staff[];
  roommates: Camper[];
}

const json = (token: string) => ({ ...bearer(token), "content-type": "application/json" });

/** Result of GET /api/campers/lookup/:id — emergency QR scan of any kid (name + health included). */
export interface CamperLookupResult {
  camper: CamperRecord & { name: string; health: HealthInfo | null };
  /** present on out-of-scope scans so the UI can show the room without the bedrooms collection */
  bedroom?: { id: string; name: string; group: "girls" | "boys" | "staff" } | null;
  /** present on out-of-scope scans so the UI can show the líder without the staff collection */
  caretaker?: { id: string; name: string } | null;
  /** true when the kid was already in the scanner's normal scope */
  belonged: boolean;
  foreignLookupCount: number;
  foreignLookupBlocked: boolean;
}

/**
 * Emergency QR lookup — the only intentional HTTP GET for a kid outside the
 * realtime snapshot. Logs the scan server-side; out-of-scope scans tick the
 * staff member's counter (≥3 SMS to admins, ≥5 blocks).
 */
export async function lookupCamper(token: string, id: string): Promise<CamperLookupResult> {
  return api<CamperLookupResult>(`/api/campers/lookup/${encodeURIComponent(id)}`, { headers: bearer(token) });
}

/** An existing IPAlpha person joins this camp's kids (`POST /api/campers {personId, …ops}`). */
export async function addCamper(token: string, personId: string, ops: CamperOpsInput = {}): Promise<CamperRecord> {
  const res = await command<{ camper: CamperRecord }>("/api/campers", { method: "POST", headers: json(token), body: JSON.stringify({ personId, ...ops }) }, ["campers", "bedrooms"]);
  return res.camper;
}

export interface CamperRegistration {
  name: string;
  /** "YYYY-MM-DD" */
  birthDate: string;
  responsible: { name: string; phone: string };
  health?: Partial<HealthInfo>;
}

/** A NEW kid + responsável registered in IPAlpha by the coordenação (`POST /api/campers/register`). */
export async function registerCamper(token: string, input: CamperRegistration & CamperOpsInput): Promise<{ camper: CamperRecord & { name: string }; responsible: { personId: string; created: boolean } }> {
  return command("/api/campers/register", { method: "POST", headers: json(token), body: JSON.stringify(input) }, ["campers", "bedrooms"]);
}

export async function updateCamper(token: string, id: string, patch: CamperOpsInput): Promise<CamperRecord> {
  const res = await command<{ camper: CamperRecord }>(`/api/campers/${id}`, { method: "PUT", headers: json(token), body: JSON.stringify(patch) }, ["campers", "bedrooms"]);
  return res.camper;
}

/** Moves the kid to another room and (optionally) under a caretaker of that room. `caretakerId` null = orphan. */
export async function moveCamper(token: string, id: string, bedroom: string | null, caretakerId: string | null): Promise<CamperRecord> {
  return updateCamper(token, id, { bedroom, caretakerId });
}

/** The kid leaves this camp's operations (the IPAlpha membership is removed when the coordenação may). */
export async function deleteCamper(token: string, id: string): Promise<{ membershipRemoved: boolean }> {
  return command(`/api/campers/${id}`, { method: "DELETE", headers: bearer(token) }, ["campers", "bedrooms"]);
}

/** The kid's page: camp ops + name + health (roles allowed) + responsáveis — read live, never stored. */
/** A health edit IPAlpha refused for this role (core's own-kids rule) — nothing was saved. */
export function isHealthForbidden(err: unknown): boolean {
  return err instanceof ApiError && err.status === 403 && err.code === "CORE_FORBIDDEN";
}

/** `responsiblesHidden`: IPAlpha does not show this role the kid's responsáveis (roles policy `seesPersonsOf`) — not "none". */
export type CamperWithResponsibles = Camper & { responsibles: Responsible[]; responsiblesHidden?: boolean };

export async function fetchCamper(token: string, id: string): Promise<CamperWithResponsibles> {
  const res = await api<{ camper: CamperWithResponsibles }>(`/api/campers/${encodeURIComponent(id)}`, { headers: bearer(token) });
  return res.camper;
}

/** `GET /api/campers/:id/responsibles` — who to talk to about a kid: names only, never health (404 CAMPER_NOT_FOUND when out of scope). */
export interface CamperResponsibles {
  camper: { id: string; name: string };
  responsibles: Responsible[];
  /** IPAlpha does not show this role the kid's responsáveis — not "none" */
  responsiblesHidden?: boolean;
}

/** The kid's responsáveis (names only) — the WhatsApp button reads phones per responsável, on tap. */
export async function fetchCamperResponsibles(token: string, id: string): Promise<CamperResponsibles> {
  const res = await api<CamperResponsibles>(`/api/campers/${encodeURIComponent(id)}/responsibles`, { headers: bearer(token), cache: "no-store" });
  return { camper: res.camper, responsibles: res.responsibles ?? [], ...(res.responsiblesHidden ? { responsiblesHidden: true } : {}) };
}

/** The fields a PARENT may edit on their own kid ("Informações de saúde"). Everything but `generalNotes` is medical. */
export type ParentEditableField = "allergies" | "drugAllergies" | "healthIssues" | "medications" | "foodRestrictions" | "healthNotes" | "weightKg" | "insurance" | "insuranceCard" | "generalNotes";
export type ParentPatch = Partial<Omit<HealthInfo, "neurodivergent"> & { generalNotes: string }>;

/** The fields the MEDICAL team may edit on any kid — the health block, plus `neurodivergent`. */
export type MedicalEditableField = Exclude<ParentEditableField, "generalNotes"> | "neurodivergent";
export type MedicalPatch = Partial<HealthInfo>;

/** a field that can appear in the kid's change history (parent or medical edits) */
export type CamperChangeField = ParentEditableField | MedicalEditableField;

export const PARENT_FIELD_LABEL: Record<CamperChangeField, string> = {
  allergies: "Alergias",
  drugAllergies: "Alergia a medicamentos",
  healthIssues: "Condição de saúde",
  medications: "Medicação",
  foodRestrictions: "Alimentação",
  healthNotes: "Observações médicas",
  weightKg: "Peso",
  insurance: "Convênio",
  insuranceCard: "Carteirinha",
  generalNotes: "Observações",
  neurodivergent: "Neurodivergência",
};

/** Which fields of a kid were edited, by whom and when (no before / after values — the data lives in IPAlpha). */
export interface CamperChange {
  id: string;
  /** the kid */
  personId: string;
  at: string;
  byPersonId: string;
  byRole: string;
  /** at least one MEDICAL field changed */
  medical: boolean;
  fields: CamperChangeField[];
}

/** Answer of a health / notes edit: the record + the health as written in IPAlpha. */
export type CamperHealthAnswer = { camper: CamperRecord & { health: HealthInfo | null }; changed: boolean };

/** A PARENT edits the "Informações de saúde" of their own kid (written to IPAlpha). */
export async function parentUpdateCamper(token: string, id: string, patch: ParentPatch): Promise<CamperHealthAnswer> {
  return command<CamperHealthAnswer>(`/api/campers/${id}/parent`, { method: "PUT", headers: json(token), body: JSON.stringify(patch) }, ["campers"]);
}

/** The care team (`saude`) or the coordenação edits the health block of a kid (written to IPAlpha). */
export async function medicalUpdateCamper(token: string, id: string, patch: MedicalPatch): Promise<CamperHealthAnswer> {
  return command<CamperHealthAnswer>(`/api/campers/${id}/health`, { method: "PUT", headers: json(token), body: JSON.stringify(patch) }, ["campers"]);
}

/** The parent-edit history of one kid, newest first (admin). */
export async function listCamperChanges(token: string, id: string): Promise<CamperChange[]> {
  const res = await api<{ changes: CamperChange[] }>(`/api/campers/${id}/changes`, { headers: bearer(token) });
  return res.changes;
}

export type CheckinKind = "church" | "bus" | "bus_return";
const checkinPath = (id: string, kind: CheckinKind) =>
  `/api/campers/${id}/checkin${kind === "bus" ? "/bus" : kind === "bus_return" ? "/bus-return" : ""}`;

/** The kid arrived (church: parent confirmed the data at the gate; bus: boarded). */
export async function checkinCamper(token: string, id: string, kind: CheckinKind = "church"): Promise<CamperRecord> {
  const res = await command<{ camper: CamperRecord }>(checkinPath(id, kind), { method: "POST", headers: bearer(token) }, ["campers"]);
  return res.camper;
}

export async function undoCheckinCamper(token: string, id: string, kind: CheckinKind = "church"): Promise<CamperRecord> {
  const res = await command<{ camper: CamperRecord }>(checkinPath(id, kind), { method: "DELETE", headers: bearer(token) }, ["campers"]);
  return res.camper;
}

/**
 * "YYYY-MM-DD" of the kid's birthday that falls inside the camp (first → last
 * event day, inclusive), or null. Mirrors the server's `birthdayDuringCamp`.
 */
export function birthdayDuringCamp(birthDate: string | null, from: string | null, until: string | null): string | null {
  if (!birthDate || !from || !until) return null;
  const md = birthDate.slice(5, 10);
  if (md.length !== 5) return null;
  for (const y of new Set([from.slice(0, 4), until.slice(0, 4)])) {
    const day = `${y}-${md}`;
    if (day >= from && day <= until) return day;
  }
  return null;
}

/** age in whole years at `at` (defaults to today) — lives in ../age.ts so the room worker can use it without this module's browser deps */
export { ageOf } from "../age";
