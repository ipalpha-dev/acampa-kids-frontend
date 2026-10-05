import { bearer } from "../auth/store";
import { api, command } from "./client";

/**
 * The care team's medication checklist. The PRESCRIPTION lives in IPAlpha
 * (the kid's health block — `GET /api/medications/prescriptions`, read live);
 * each record here is ONE dose the team ticked as given.
 */
export interface MedicationDose {
  id: string;
  /** the kid (person id) */
  personId: string;
  /** normalized medicine name — links the tick to the prescription */
  medKey: string;
  medName: string;
  dose: string;
  /** "YYYY-MM-DD" the dose belongs to */
  day: string;
  /** "HH:MM" of the prescribed moment, or "sos" (quando necessário) */
  slot: string;
  givenAt: string;
  /** who ticked it (person id — name read live) */
  byPersonId: string;
  note: string;
}

/** One kid who takes medicines (live from IPAlpha). */
export interface Prescription {
  personId: string;
  name: string;
  medications: import("./campers").Medication[];
}

/** `GET /api/medications/prescriptions?cursor` — one page (≤ 200) of the kids with medicines. */
export function fetchPrescriptionsPage(token: string, cursor: string | null): Promise<{ items: Prescription[]; nextCursor: string | null }> {
  return api(`/api/medications/prescriptions${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, { headers: bearer(token) });
}

/** "quando necessário" doses: no fixed time, may repeat in the same day */
export const SOS_SLOT = "sos";

/** Medicine name → the key the backend stores (must match models/medications.ts). */
export function medKeyOf(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export interface MedicationDoseInput {
  /** the kid (person id) */
  personId: string;
  medName: string;
  /** "YYYY-MM-DD" — defaults to today (camp time zone) on the server */
  day?: string;
  slot: string;
  note?: string;
}

/** Ticks one dose. A scheduled slot already ticked returns the same record. */
export async function giveMedication(token: string, input: MedicationDoseInput): Promise<MedicationDose> {
  const res = await command<{ medication: MedicationDose }>(
    "/api/medications",
    { method: "POST", headers: { ...bearer(token), "content-type": "application/json" }, body: JSON.stringify(input) },
    ["medications"],
  );
  return res.medication;
}

/** Unticks one dose (a mistake). */
export async function undoMedication(token: string, id: string): Promise<void> {
  await command(`/api/medications/${id}`, { method: "DELETE", headers: bearer(token) }, ["medications"]);
}
