import * as XLSX from "xlsx";
import { GROUP_META, bedroomLabel, type Bedroom } from "./api/bedrooms";
import { fetchCamper, medicationsText, type Camper, type CamperCheckin, type HealthInfo, type Responsible } from "./api/campers";
import { emailOf, fetchPersonData, phoneOf, type EmergencyContact, type HealthList } from "./api/people";
import { fetchStaff, ROOM_ROLE_META, type Staff } from "./api/staff";
import { speakDateTime } from "./dates";
import { loadHealthLists } from "./hooks/usePersonData";
import { LITERALS, deviceLocale, type Locale } from "./i18n";
import { format } from "./i18n/locales";
import { formatBrazilPhoneClient } from "./phoneFormat";
import { namesFor, personInfo } from "./store/people";

/**
 * Excel downloads: campers, staff, and bedrooms (one tab per room).
 *
 * Only what the acting role may see, read LIVE at export time (CONTRACTS_ACAMPA
 * §15/§16): the names come joined on the records, the health block per person
 * (GET /api/campers/:id, /api/staff/:id) only when the role is allowed health,
 * the responsáveis per kid, and phones / e-mails per person (persons-api data
 * routes — every read is logged for the person) only when the role is allowed
 * contacts. Nothing fetched here is cached or stored: it goes straight into
 * the workbook and is dropped.
 */

export interface ExportContext {
  token: string;
  /** the acting role may read the health block (saúde / coordenação) */
  healthAllowed: boolean;
  /** the acting role may read phones / e-mails (core's role rules still decide per person) */
  contactsAllowed: boolean;
  /** live reads done / total — the button shows it while the workbook is built */
  onProgress?: (done: number, total: number) => void;
}

type LabelOf = (id: string | null | undefined) => string | null;
type Row = Record<string, string | number>;

/** Parallel live reads at a time — small, so core is not flooded by one export. */
const CONCURRENCY = 6;

// ── i18n (the spreadsheet follows the device language, like the screens) ──

let exportLocale: Locale = "pt";
function tx(pt: string, vars?: Record<string, string | number>): string {
  return format(exportLocale === "pt" ? pt : (LITERALS[pt]?.[exportLocale] ?? pt), vars ?? {});
}
function refreshLocale() {
  try {
    exportLocale = deviceLocale();
  } catch {
    exportLocale = "pt";
  }
}

// ── helpers ────────────────────────────────────────────────────────────

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });
const yesNo = (v: unknown) => (v ? tx("Sim") : tx("Não"));
const sexLabel = (sex: "F" | "M" | null | undefined) => (sex === "F" ? tx("Feminino") : sex === "M" ? tx("Masculino") : "");
const displayName = (p: { name: string }) => p.name || tx("Nome indisponível no momento");
const phone = (p: string | null) => (p ? formatBrazilPhoneClient(p) : "");

function labels(labelOf: (id: string) => string, ids: readonly string[] | null | undefined): string {
  return (ids ?? []).map(labelOf).filter(Boolean).join("; ");
}

/** Runs `fn` over `items` with at most CONCURRENCY in flight, reporting progress. A failed read yields null. */
async function mapLimit<T, R>(items: readonly T[], fn: (item: T) => Promise<R>, onProgress?: (done: number, total: number) => void): Promise<(R | null)[]> {
  const out: (R | null)[] = new Array(items.length).fill(null);
  let next = 0;
  let done = 0;
  onProgress?.(0, items.length);
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = await fn(items[i]);
      } catch {
        out[i] = null;
      }
      done++;
      onProgress?.(done, items.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
  return out;
}

/** Health option id → label: the church lists (persons-api) first, then Acampa's own categories. */
async function healthLabeler(ctx: ExportContext, labelOf: LabelOf): Promise<(id: string) => string> {
  const map = new Map<string, string>();
  if (ctx.healthAllowed) {
    const lists: HealthList[] = await loadHealthLists(ctx.token).catch(() => []);
    for (const l of lists) for (const o of l.options) map.set(o.id, optionLabel(o.label));
  }
  return (id: string) => map.get(id) ?? labelOf(id) ?? "";
}

function optionLabel(label: Record<string, string> | string): string {
  if (typeof label === "string") return label;
  const keys: Record<Locale, string[]> = { pt: ["pt-BR", "pt"], en: ["en-US", "en"], es: ["es"], fr: ["fr"], de: ["de"] };
  for (const k of [...keys[exportLocale], "pt-BR", "pt"]) if (label[k]) return label[k];
  return Object.values(label)[0] ?? "";
}

/** Names of every person id the sheet mentions (check-in by, caretakers…) — one batched read. */
async function warmNames(ids: (string | null | undefined)[]): Promise<void> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (unique.length) await namesFor(unique).catch(() => []);
}
const nameOf = (id: string | null | undefined) => (id ? (personInfo(id)?.name ?? "") : "");

/** Who recorded a check-in: whoever did the roll call, or the person themself from their phone. */
function checkinBy(c: CamperCheckin | null | undefined, selfId?: string): string {
  if (!c) return "";
  const who = nameOf(c.byPersonId);
  const base = c.byPersonId && c.byPersonId === selfId ? tx("{name} (próprio celular)", { name: who }) : who;
  return c.note ? `${base} (${c.note})` : base;
}

function emergencyText(e: EmergencyContact | null | undefined): string {
  if (!e) return "";
  if (typeof e === "string") return e;
  return [e.name, e.relation ? `(${e.relation})` : "", phone(e.phone)].filter(Boolean).join(" ");
}

function healthColumns(h: HealthInfo | null | undefined, hl: (id: string) => string, withNeuro: boolean): Row {
  const row: Row = {
    [tx("Peso (kg)")]: h?.weightKg ?? "",
    [tx("Alergias")]: labels(hl, h?.allergies),
    [tx("Alergia a medicamentos")]: labels(hl, h?.drugAllergies),
    [tx("Condições de saúde")]: labels(hl, h?.healthIssues),
  };
  if (withNeuro) row[tx("Neurodivergente")] = h ? yesNo(h.neurodivergent) : "";
  row[tx("Medicamentos")] = h ? medicationsText(h.medications ?? []) : "";
  row[tx("Restrições alimentares")] = h?.foodRestrictions ?? "";
  row[tx("Observações médicas")] = h?.healthNotes ?? "";
  row[tx("Convênio")] = h?.insurance ?? "";
  row[tx("Carteirinha do convênio")] = h?.insuranceCard ?? "";
  return row;
}

// ── live reads ─────────────────────────────────────────────────────────

interface CamperLive {
  health: HealthInfo | null;
  responsibles: Responsible[];
  responsiblePhones: string[];
  emergency: string;
}

async function readCamper(ctx: ExportContext, id: string): Promise<CamperLive> {
  const page = await fetchCamper(ctx.token, id);
  const responsibles = page.responsibles ?? [];
  let responsiblePhones: string[] = [];
  let emergency = "";
  if (ctx.contactsAllowed) {
    const [phones, contact] = await Promise.all([
      Promise.all(responsibles.map((r) => fetchPersonData(ctx.token, r.personId, "phone").then(phoneOf).catch(() => null))),
      fetchPersonData(ctx.token, id, "emergencyContact").catch(() => null),
    ]);
    responsiblePhones = phones.filter((p): p is string => !!p).map(phone);
    emergency = emergencyText(contact);
  }
  return { health: ctx.healthAllowed ? (page.health ?? null) : null, responsibles, responsiblePhones, emergency };
}

interface StaffLive {
  health: HealthInfo | null;
  phone: string;
  email: string;
}

async function readStaff(ctx: ExportContext, id: string): Promise<StaffLive> {
  const [page, ph, em] = await Promise.all([
    ctx.healthAllowed ? fetchStaff(ctx.token, id).catch(() => null) : Promise.resolve(null),
    ctx.contactsAllowed ? fetchPersonData(ctx.token, id, "phone").then(phoneOf).catch(() => null) : Promise.resolve(null),
    ctx.contactsAllowed ? fetchPersonData(ctx.token, id, "email").then(emailOf).catch(() => null) : Promise.resolve(null),
  ]);
  return { health: page?.health ?? null, phone: phone(ph), email: em ?? "" };
}

// ── rows ───────────────────────────────────────────────────────────────

function placeColumns(p: { bedroom: string | null; team: string | null }, roomById: Map<string, Bedroom>, labelOf: LabelOf): Row {
  const room = p.bedroom ? roomById.get(p.bedroom) : null;
  return {
    [tx("Time")]: labelOf(p.team) ?? "",
    [tx("Ala")]: room ? tx(GROUP_META[room.group].label) : "",
    [tx("Quarto")]: room?.name ?? "",
  };
}

function camperRow(ctx: ExportContext, k: Camper, live: CamperLive | null, roomById: Map<string, Bedroom>, labelOf: LabelOf, hl: (id: string) => string): Row {
  const row: Row = {
    [tx("Nome")]: displayName(k),
    [tx("Apelido")]: k.nickname ?? "",
    [tx("Sexo")]: sexLabel(k.sex),
    [tx("Convidado por")]: k.invitedBy ?? "",
    [tx("Líder do quarto")]: nameOf(k.caretakerId),
    ...placeColumns(k, roomById, labelOf),
    [tx("Cama")]: labelOf(k.bed) ?? "",
    [tx("Transporte")]: labelOf(k.transportation) ?? "",
    ...(ctx.healthAllowed ? healthColumns(live?.health, hl, true) : {}),
    [tx("Observações gerais")]: k.generalNotes ?? "",
    [tx("Preferência de quarto")]: k.bedroomPreference ?? "",
    [tx("Responsável")]: (live?.responsibles ?? []).map((r) => r.name).filter(Boolean).join("; "),
  };
  if (ctx.contactsAllowed) {
    row[tx("Celular do responsável")] = (live?.responsiblePhones ?? []).join("; ");
    row[tx("Contato de emergência")] = live?.emergency ?? "";
  }
  Object.assign(row, {
    [tx("QR token")]: k.qrToken ?? "",
    [tx("Check-in")]: yesNo(k.checkin),
    [tx("Check-in em")]: k.checkin ? speakDateTime(k.checkin.at) : "",
    [tx("Check-in por")]: checkinBy(k.checkin),
    [tx("Check-in ônibus ida")]: yesNo(k.busCheckin),
    [tx("Check-in ônibus ida em")]: k.busCheckin ? speakDateTime(k.busCheckin.at) : "",
    [tx("Check-in ônibus ida por")]: checkinBy(k.busCheckin),
    [tx("Check-in ônibus volta")]: yesNo(k.busReturnCheckin),
    [tx("Check-in ônibus volta em")]: k.busReturnCheckin ? speakDateTime(k.busReturnCheckin.at) : "",
    [tx("Check-in ônibus volta por")]: checkinBy(k.busReturnCheckin),
  });
  return row;
}

/**
 * The care team's sheet: identification, where the kid sleeps and who looks
 * after them, the health block, who to call, and whether the kid actually went
 * to the camp ("Foi para o acampamento" = the church check-in).
 */
function medicalCamperRow(ctx: ExportContext, k: Camper, live: CamperLive | null, roomById: Map<string, Bedroom>, labelOf: LabelOf, hl: (id: string) => string): Row {
  const row: Row = {
    [tx("Nome")]: displayName(k),
    [tx("Foi para o acampamento")]: yesNo(k.checkin),
    [tx("Sexo")]: sexLabel(k.sex),
    ...placeColumns(k, roomById, labelOf),
    [tx("Líder do quarto")]: nameOf(k.caretakerId),
    ...(ctx.healthAllowed ? healthColumns(live?.health, hl, true) : {}),
    [tx("Observações gerais")]: k.generalNotes ?? "",
    [tx("Responsável")]: (live?.responsibles ?? []).map((r) => r.name).filter(Boolean).join("; "),
  };
  if (ctx.contactsAllowed) {
    row[tx("Celular do responsável")] = (live?.responsiblePhones ?? []).join("; ");
    row[tx("Contato de emergência")] = live?.emergency ?? "";
  }
  return row;
}

function staffRow(ctx: ExportContext, s: Staff, live: StaffLive | null, roomById: Map<string, Bedroom>, labelOf: LabelOf, hl: (id: string) => string): Row {
  const row: Row = {
    [tx("Nome")]: displayName(s),
    [tx("Apelido")]: s.nickname ?? "",
    [tx("Sexo")]: sexLabel(s.sex),
  };
  if (ctx.contactsAllowed) {
    row[tx("Celular")] = live?.phone ?? "";
    row[tx("E-mail")] = live?.email ?? "";
  }
  Object.assign(row, {
    [tx("Ativo")]: yesNo(s.active),
    ...placeColumns(s, roomById, labelOf),
    [tx("Função no quarto")]: s.roomRole ? tx(ROOM_ROLE_META[s.roomRole].label) : "",
    [tx("Transporte")]: labelOf(s.transportation) ?? "",
    ...(ctx.healthAllowed ? healthColumns(live?.health, hl, false) : {}),
    [tx("Observações gerais")]: s.generalNotes ?? "",
    [tx("Check-in")]: yesNo(s.checkin),
    [tx("Check-in em")]: s.checkin ? speakDateTime(s.checkin.at) : "",
    [tx("Check-in por")]: checkinBy(s.checkin, s.id),
    [tx("Colete entregue")]: yesNo(s.vest?.delivered),
    [tx("Colete entregue em")]: s.vest?.delivered ? speakDateTime(s.vest.delivered.at) : "",
    [tx("Colete entregue por")]: checkinBy(s.vest?.delivered),
    [tx("Colete devolvido")]: yesNo(s.vest?.returned),
    [tx("Colete devolvido em")]: s.vest?.returned ? speakDateTime(s.vest.returned.at) : "",
    [tx("Colete devolvido por")]: checkinBy(s.vest?.returned),
    [tx("Leituras fora do escopo")]: s.foreignLookupCount ?? 0,
    [tx("Crianças lidas fora do escopo")]: (s.foreignLookupCamperIds ?? []).map(nameOf).filter(Boolean).join("; "),
  });
  return row;
}

// ── download ───────────────────────────────────────────────────────────

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function saveWorkbook(wb: XLSX.WorkBook, basename: string) {
  XLSX.writeFile(wb, `${basename}-${stamp()}.xlsx`, { compression: true });
}

function sheet(rows: Row[], headers?: string[]): XLSX.WorkSheet {
  const cols = headers ?? (rows[0] ? Object.keys(rows[0]) : []);
  const ws = XLSX.utils.json_to_sheet(rows, { header: cols });
  // auto-ish column widths (capped so long notes don't blow the sheet up)
  ws["!cols"] = cols.map((c) => ({ wch: Math.min(60, Math.max(c.length, ...rows.map((r) => String(r[c] ?? "").length)) + 2) }));
  return ws;
}

/** Excel tab names: max 31 chars, no  : \ / ? * [ ]  and unique within the workbook. */
function sheetName(raw: string, used: Set<string>): string {
  const base = raw.replace(/[:\\/?*[\]]/g, "-").slice(0, 31).trim() || tx("Quarto");
  let name = base;
  let n = 2;
  while (used.has(name)) (name = `${base.slice(0, 31 - ` (${n})`.length)} (${n})`), n++;
  used.add(name);
  return name;
}

async function buildCamperSheet(
  ctx: ExportContext,
  campers: Camper[],
  bedrooms: Bedroom[],
  labelOf: LabelOf,
  staff: Staff[],
  rowOf: typeof camperRow,
): Promise<XLSX.WorkSheet> {
  refreshLocale();
  const roomById = new Map(bedrooms.map((b) => [b.id, b]));
  const sorted = campers.slice().sort(byName);
  const [hl, lives] = await Promise.all([
    healthLabeler(ctx, labelOf),
    mapLimit(sorted, (k) => readCamper(ctx, k.id), ctx.onProgress),
    warmNames([
      ...sorted.flatMap((k) => [k.caretakerId, k.checkin?.byPersonId, k.busCheckin?.byPersonId, k.busReturnCheckin?.byPersonId]),
      ...staff.filter((s) => !s.name).map((s) => s.id),
    ]),
  ]);
  const rows = sorted.map((k, i) => rowOf(ctx, k, lives[i], roomById, labelOf, hl));
  const headers = Object.keys(rowOf(ctx, BLANK_CAMPER, null, roomById, labelOf, hl));
  return sheet(rows, headers);
}

// ── public API ─────────────────────────────────────────────────────────

/** Every kid with the columns the acting role may see (health / contacts read live, never kept). */
export async function downloadCampersXlsx(ctx: ExportContext, campers: Camper[], bedrooms: Bedroom[], labelOf: LabelOf, staff: Staff[] = []): Promise<void> {
  const ws = await buildCamperSheet(ctx, campers, bedrooms, labelOf, staff, camperRow);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, tx("Acampantes"));
  saveWorkbook(wb, "acampantes");
}

/** The care team's download: every kid, health-relevant columns only (health only when the role is allowed). */
export async function downloadMedicalCampersXlsx(ctx: ExportContext, campers: Camper[], bedrooms: Bedroom[], labelOf: LabelOf, staff: Staff[] = []): Promise<void> {
  const ws = await buildCamperSheet(ctx, campers, bedrooms, labelOf, staff, medicalCamperRow);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, tx("Acampantes"));
  saveWorkbook(wb, "acampantes-saude");
}

/** The team with the columns the acting role may see (phone / e-mail / health read live, never kept). */
export async function downloadStaffXlsx(ctx: ExportContext, staff: Staff[], bedrooms: Bedroom[], labelOf: LabelOf): Promise<void> {
  refreshLocale();
  const roomById = new Map(bedrooms.map((b) => [b.id, b]));
  const sorted = staff.slice().sort(byName);
  const needsLive = ctx.healthAllowed || ctx.contactsAllowed;
  const [hl, lives] = await Promise.all([
    healthLabeler(ctx, labelOf),
    needsLive ? mapLimit(sorted, (s) => readStaff(ctx, s.id), ctx.onProgress) : Promise.resolve(sorted.map(() => null)),
    warmNames(sorted.flatMap((s) => [s.checkin?.byPersonId, s.vest?.delivered?.byPersonId, s.vest?.returned?.byPersonId, ...(s.foreignLookupCamperIds ?? [])])),
  ]);
  const rows = sorted.map((s, i) => staffRow(ctx, s, lives[i], roomById, labelOf, hl));
  const headers = Object.keys(staffRow(ctx, BLANK_STAFF, null, roomById, labelOf, hl));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet(rows, headers), tx("Equipe"));
  saveWorkbook(wb, "equipe");
}

/** One workbook: a "Resumo" tab plus one tab per bedroom listing who sleeps there — names and camp places only. */
export function downloadBedroomsXlsx(bedrooms: Bedroom[], campers: Camper[], staff: Staff[], labelOf: LabelOf): void {
  refreshLocale();
  const wb = XLSX.utils.book_new();
  const rooms = bedrooms.slice().sort((a, b) => GROUP_ORDER[a.group] - GROUP_ORDER[b.group] || a.name.localeCompare(b.name, "pt-BR", { numeric: true }));

  const summary: Row[] = rooms.map((b) => {
    const kids = campers.filter((k) => k.bedroom === b.id);
    const people = staff.filter((s) => s.bedroom === b.id);
    const occupied = kids.length + people.length;
    return {
      [tx("Ala")]: tx(GROUP_META[b.group].label),
      [tx("Quarto")]: b.name,
      [tx("Beliches")]: b.bunkBeds,
      [tx("Camas de solteiro")]: b.singleBeds,
      [tx("Capacidade")]: b.capacity,
      [tx("Ocupadas")]: occupied,
      [tx("Livres")]: b.capacity - occupied,
      [tx("Crianças")]: kids.length,
      [tx("Equipe")]: people.length,
      [tx("Quem cuida do quarto")]: people.slice().sort(byName).map(displayName).join("; "),
      [tx("Observações")]: b.notes,
    };
  });
  const used = new Set<string>([tx("Resumo")]);
  XLSX.utils.book_append_sheet(wb, sheet(summary), tx("Resumo"));

  const headers = [tx("Tipo"), tx("Nome"), tx("Função no quarto"), tx("Cama"), tx("Time")];
  for (const b of rooms) {
    const people = staff.filter((s) => s.bedroom === b.id).sort(byName);
    const kids = campers.filter((k) => k.bedroom === b.id).sort(byName);
    const rows: Row[] = [
      ...people.map((s) => ({
        [tx("Tipo")]: tx("Equipe"),
        [tx("Nome")]: displayName(s),
        [tx("Função no quarto")]: s.roomRole ? tx(ROOM_ROLE_META[s.roomRole].label) : "",
        [tx("Cama")]: "",
        [tx("Time")]: labelOf(s.team) ?? "",
      })),
      ...kids.map((k) => ({
        [tx("Tipo")]: tx("Criança"),
        [tx("Nome")]: displayName(k),
        [tx("Função no quarto")]: "",
        [tx("Cama")]: labelOf(k.bed) ?? "",
        [tx("Time")]: labelOf(k.team) ?? "",
      })),
    ];
    XLSX.utils.book_append_sheet(wb, sheet(rows, headers), sheetName(bedroomLabel(b), used));
  }

  saveWorkbook(wb, "quartos");
}

const GROUP_ORDER: Record<Bedroom["group"], number> = { girls: 0, boys: 1, staff: 2 };

// used only to derive the header order when the list is empty
const BLANK_CAMPER: Camper = {
  id: "",
  personId: "",
  name: "",
  nickname: null,
  sex: null,
  invitedBy: "",
  caretakerId: null,
  qrToken: "",
  team: null,
  transportation: null,
  bed: null,
  bedroom: null,
  generalNotes: "",
  bedroomPreference: "",
  checkin: null,
  busCheckin: null,
  busReturnCheckin: null,
  parentEditedAt: null,
  importId: null,
  aiReviewStatus: null,
  aiReviewError: "",
  aiReviewStartedAt: null,
  aiReviewFinishedAt: null,
  createdAt: "",
  updatedAt: "",
};

const BLANK_STAFF: Staff = {
  id: "",
  personId: "",
  name: "",
  nickname: null,
  sex: null,
  active: true,
  team: null,
  transportation: null,
  bedroom: null,
  roomRole: "helper",
  generalNotes: "",
  checkin: null,
  vest: { delivered: null, returned: null },
  prepDone: [],
  foreignLookupCount: 0,
  foreignLookupCamperIds: [],
  createdAt: "",
  updatedAt: "",
};
