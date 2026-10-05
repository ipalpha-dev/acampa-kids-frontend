import { useEffect, useMemo } from "react";
import { MEDICATION_PRESETS } from "../components/MedicationsEditor";
import { fetchPrescriptionsPage, medKeyOf, prescriptionHealth, SOS_SLOT, type MedicationDose, type Prescription } from "../api/medications";
import type { Camper, HealthInfo, Medication } from "../api/campers";
import { applyServerData, getState, useCollection, useCollectionOrEmpty, useConnection } from "../store";
import { rememberPeople } from "../store/people";
import { fetchAllPages } from "./usePagedList";

let prescriptionsRun: Promise<void> | null = null;

/**
 * Reads the kids' medicines live from IPAlpha (`GET /api/medications/prescriptions`,
 * paged in the background) into the local `prescriptions` collection — the
 * care team's checklist keeps working offline from the encrypted copy (health
 * is kept offline only for saúde / coordenação). Re-read on each connection.
 */
export function usePrescriptionsSync(token: string): void {
  const connection = useConnection();
  useEffect(() => {
    if (connection !== "online" || prescriptionsRun) return;
    const all: Prescription[] = [];
    prescriptionsRun = fetchAllPages((cursor) => fetchPrescriptionsPage(token, cursor), (items) => {
      all.push(...items);
      rememberPeople(items.map((p) => ({ personId: p.personId, name: p.name })));
    })
      .then(() => applyServerData({ prescriptions: all }, getState().syncedAt ?? new Date().toISOString()))
      .catch(() => {})
      .finally(() => {
        prescriptionsRun = null;
      });
  }, [token, connection]);
}

/**
 * One line of the checklist: a kid × a medicine × a prescribed moment.
 * The same kid appears once per moment they take something.
 */
export interface MedEntry {
  kid: Camper;
  med: Medication;
  medKey: string;
  /** "HH:MM", "sos", or "" for a medicine the parents never scheduled */
  slot: string;
  /** option ids of medicines the kid must NOT take (`drugAllergies` of the prescriptions read) */
  drugAllergies: string[];
  /** what the prescriptions read carries about the kid's health, for the popup (care team only) */
  health: HealthInfo;
}

/** the checklist of ONE day, already grouped the way both the tab and the home card show it */
export interface MedicationDay {
  /** the moments of the day, in clock order, each with the kids due then */
  slots: { slot: string; rows: MedEntry[] }[];
  /** "quando necessário" medicines — no fixed time, may repeat */
  sos: MedEntry[];
  /** neither a time nor "quando necessário": the team must confirm with the parents */
  unscheduled: MedEntry[];
  /** how many kids take anything at all (before the search filter) */
  kidsWithMeds: number;
  /** ticks of the day, keyed "<personId>|<medKey>|<slot>" (scheduled doses only) */
  given: Map<string, MedicationDose>;
  /** "quando necessário" doses of the day, keyed "<personId>|<medKey>" (they repeat) */
  sosGiven: Map<string, MedicationDose[]>;
  /** scheduled doses already ticked / due today */
  doneCount: number;
  total: number;
  /** null while the collections have not arrived yet */
  loading: boolean;
}

export const normalizeName = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/** "HH:MM" → minutes, for sorting the moments of the day */
export function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** the same label split up, for headings that style the icon and the hour apart */
export function slotParts(slot: string): { emoji?: string; icon?: string; text: string } {
  if (slot === SOS_SLOT) return { emoji: "🆘", text: "Quando necessário" };
  const p = MEDICATION_PRESETS.find((x) => x.time === slot);
  if (!p) return { emoji: "🕒", text: slot };
  return { emoji: p.emoji, icon: p.icon, text: `${p.label} ${slot}` };
}

/** "HH:MM" of now on the device clock */
export function nowTime(now = new Date()): string {
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

/**
 * The medication checklist of `day`, built from the kids' prescriptions and
 * the ticks already made. Shared by the Medicações tab and the summary card on
 * the medical team's Início, so the two can never disagree about what is due.
 *
 * `search` filters by the kid's name (the tab's search box); the home card
 * passes nothing.
 */
export function useMedicationDay(token: string, day: string, search = ""): MedicationDay {
  usePrescriptionsSync(token);
  const campers = useCollection("campers");
  const prescriptions = useCollection("prescriptions");
  const doses = useCollection("medications");
  const bedrooms = useCollectionOrEmpty("bedrooms");

  const { slots, sos, unscheduled, kidsWithMeds } = useMemo(() => {
    /** room id → sort key: the room number when it has one, so 2 < 10 < 103 */
    const roomOrder = new Map(
      bedrooms.map((b) => {
        const n = Number(b.name.replace(/\D/g, ""));
        return [b.id, { n: Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER, name: b.name }] as const;
      }),
    );
    const byId = new Map((campers ?? []).map((k) => [k.id, k]));
    const q = normalizeName(search.trim());
    /** each kid with medicines, joined to their camp-ops record (room) when this role receives it */
    const withMeds = (prescriptions ?? [])
      .filter((p) => p.medications.length > 0)
      .map((p) => {
        const known = byId.get(p.personId);
        const kid = known ? (known.name ? known : { ...known, name: p.name }) : ({ id: p.personId, personId: p.personId, name: p.name, bedroom: null } as unknown as Camper);
        return { kid, meds: p.medications, drugAllergies: p.drugAllergies ?? [], health: prescriptionHealth(p) };
      });
    const matches = (k: Camper) => !q || normalizeName(k.name).includes(q);
    const bySlot = new Map<string, MedEntry[]>();
    const sosList: MedEntry[] = [];
    const missing: MedEntry[] = [];
    for (const { kid, meds, drugAllergies, health } of withMeds) {
      if (!matches(kid)) continue;
      for (const med of meds) {
        const entry = { kid, med, medKey: medKeyOf(med.name), drugAllergies, health };
        if (med.asNeeded) sosList.push({ ...entry, slot: SOS_SLOT });
        else if (med.times.length === 0) missing.push({ ...entry, slot: "" });
        else
          for (const t of med.times) {
            const rows = bySlot.get(t) ?? [];
            rows.push({ ...entry, slot: t });
            bySlot.set(t, rows);
          }
      }
    }
    /**
     * Room first (by its number), then the kid's name — the team walks the
     * rooms in order, so the checklist has to read in that same order. Kids
     * with no room yet come last.
     */
    const byRoomThenName = (a: MedEntry, b: MedEntry) => {
      const ra = roomOrder.get(a.kid.bedroom ?? "");
      const rb = roomOrder.get(b.kid.bedroom ?? "");
      if (ra?.n !== rb?.n) return (ra?.n ?? Number.MAX_SAFE_INTEGER) - (rb?.n ?? Number.MAX_SAFE_INTEGER);
      const byRoomName = (ra?.name ?? "").localeCompare(rb?.name ?? "", "pt-BR", { sensitivity: "base" });
      if (byRoomName !== 0) return byRoomName;
      return a.kid.name.localeCompare(b.kid.name, "pt-BR", { sensitivity: "base" });
    };
    return {
      slots: [...bySlot.entries()].sort((a, b) => minutesOf(a[0]) - minutesOf(b[0])).map(([slot, rows]) => ({ slot, rows: rows.sort(byRoomThenName) })),
      sos: sosList.sort(byRoomThenName),
      unscheduled: missing.sort(byRoomThenName),
      kidsWithMeds: withMeds.length,
    };
  }, [campers, prescriptions, bedrooms, search]);

  const given = useMemo(() => {
    const map = new Map<string, MedicationDose>();
    for (const d of doses ?? []) if (d.day === day && d.slot !== SOS_SLOT) map.set(`${d.personId}|${d.medKey}|${d.slot}`, d);
    return map;
  }, [doses, day]);

  const sosGiven = useMemo(() => {
    const map = new Map<string, MedicationDose[]>();
    for (const d of doses ?? []) {
      if (d.day !== day || d.slot !== SOS_SLOT) continue;
      const key = `${d.personId}|${d.medKey}`;
      map.set(key, [...(map.get(key) ?? []), d]);
    }
    for (const rows of map.values()) rows.sort((a, b) => a.givenAt.localeCompare(b.givenAt));
    return map;
  }, [doses, day]);

  const rows = slots.flatMap((s) => s.rows);
  return {
    slots,
    sos,
    unscheduled,
    kidsWithMeds,
    given,
    sosGiven,
    doneCount: rows.filter((e) => given.has(`${e.kid.id}|${e.medKey}|${e.slot}`)).length,
    total: rows.length,
    loading: !prescriptions || !doses,
  };
}
