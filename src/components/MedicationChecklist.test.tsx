import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { saveAuth } from "../auth/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { applyServerData, clearStore } from "../store";
import { rememberPeople } from "../store/people";
import { prescriptionHealth, type Prescription } from "../api/medications";
import MedicationChecklist from "./MedicationChecklist";

const CAMP = { id: "c1", label: "Acampa Kids 2026", year: 2026, active: true };
const PEANUT = "opt-peanut";
const DIPYRONE = "opt-dipyrone";
const ASTHMA = "opt-asthma";
const KID = "k1";

function record(id: string) {
  return { id, personId: id, invitedBy: "", caretakerId: null, qrToken: "", team: null, transportation: null, bed: null, bedroom: null, generalNotes: "", bedroomPreference: "", checkin: null, busCheckin: null, busReturnCheckin: null, createdAt: "", parentEditedAt: null, importId: null, aiReviewStatus: null, aiReviewError: "", aiReviewStartedAt: null, aiReviewFinishedAt: null, updatedAt: "" };
}

const PRESCRIPTION: Prescription = {
  personId: KID,
  name: "Ana Paz",
  medications: [{ name: "Ritalina", dose: "10mg", times: ["08:00"], asNeeded: false, notes: "" }],
  drugAllergies: [DIPYRONE],
  allergies: [PEANUT],
  healthIssues: [ASTHMA],
};

function signIn() {
  saveAuth({ token: "tok", tokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(), user: { id: "me", personId: "me", name: "Eu Saúde", roles: ["saude"], activeRole: "saude", audience: "staff", superAdmin: false }, camp: CAMP, camps: [] });
}

function stubApi() {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), window.location.origin);
    if (url.pathname === "/api/people/health-lists")
      return Response.json({
        lists: [
          { key: "alergias", options: [{ id: PEANUT, label: { "pt-BR": "Amendoim" }, order: 1, active: true }] },
          { key: "alergia-medicamentos", options: [{ id: DIPYRONE, label: { "pt-BR": "Dipirona" }, order: 1, active: true }] },
          { key: "condicao-cronica", options: [{ id: ASTHMA, label: { "pt-BR": "Asma" }, order: 1, active: true }] },
        ],
      });
    if (url.pathname === "/api/medications/prescriptions") return Response.json({ items: [PRESCRIPTION], nextCursor: null });
    return Response.json({ error: { code: "NOT_FOUND", message: "x" } }, { status: 404 });
  }));
}

describe("medication checklist — drug allergies travel with the prescription", () => {
  beforeEach(() => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["pt-BR"]);
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
    signIn();
    stubApi();
    act(() => {
      applyServerData({ campers: [record(KID)] as never, medications: [], prescriptions: [PRESCRIPTION], bedrooms: [], staff: [], categories: [], teams: [], transports: [] } as never, new Date().toISOString());
      rememberPeople([{ personId: KID, name: "Ana Paz", nickname: null, sex: null }]);
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    act(() => clearStore());
  });

  it("the prescription's health block keeps what the read carried", () => {
    expect(prescriptionHealth(PRESCRIPTION)).toMatchObject({ drugAllergies: [DIPYRONE], allergies: [PEANUT], healthIssues: [ASTHMA], medications: PRESCRIPTION.medications });
    expect(prescriptionHealth({ personId: "x", name: "", medications: [] })).toMatchObject({ drugAllergies: [], allergies: [], healthIssues: [] });
  });

  it("flags the kid who must not take some medicine, naming it", async () => {
    render(
      <I18nProvider>
        <MedicationChecklist token="tok" day="2026-01-10" />
      </I18nProvider>,
    );
    expect(await screen.findByRole("img", { name: /Alergia a medicamentos: Dipirona — confira antes de dar/ })).toBeInTheDocument();
  });

  it("the popup shows the care team the allergies, drug allergies and conditions of the prescription", async () => {
    render(
      <I18nProvider>
        <MedicationChecklist token="tok" day="2026-01-10" />
      </I18nProvider>,
    );
    fireEvent.click(await screen.findByTitle("Ver Ana Paz"));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText(/Amendoim/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Dipirona/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Asma/)).toBeInTheDocument();
  });
});
