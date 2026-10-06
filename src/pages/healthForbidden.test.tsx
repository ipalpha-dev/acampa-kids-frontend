import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveAuth } from "../auth/store";
import { ConfirmProvider } from "../components/ConfirmDialog";
import { I18nProvider } from "../i18n";
import { applyServerData, clearStore } from "../store";
import { rememberPeople } from "../store/people";
import type { Camper } from "../api/campers";
import CamperDetail from "./admin/CamperDetail";
import { CheckinDialog } from "./CheckinPage";

/** GET /api/campers/:id when core refuses this role the kid's health: `{health: null, healthForbidden: true}`. */
const CAMP = { id: "c1", label: "Acampa Kids 2026", year: 2026, active: true };
const KID = "k1";

function record(id: string) {
  return { id, personId: id, invitedBy: "", caretakerId: null, qrToken: "", team: null, transportation: null, bed: null, bedroom: null, generalNotes: "", bedroomPreference: "", checkin: null, busCheckin: null, busReturnCheckin: null, createdAt: "", parentEditedAt: null, importId: null, updatedAt: "" };
}

function stubApi() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), window.location.origin);
      if (url.pathname === "/api/people/health-lists") return Response.json({ lists: [] });
      if (url.pathname === `/api/campers/${KID}`) return Response.json({ camper: { ...record(KID), name: "Ana Paz", nickname: null, sex: "F", responsibles: [], health: null, healthForbidden: true } });
      return Response.json({ error: { code: "NOT_FOUND", message: "x" } }, { status: 404 });
    }),
  );
}

describe("healthForbidden: 'não disponível para o seu perfil', never 'nada declarado'", () => {
  beforeEach(() => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["pt-BR"]);
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
    saveAuth({ token: "tok", tokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(), user: { id: "me", personId: "me", name: "Eu", roles: ["coordenacao"], activeRole: "coordenacao", audience: "admin", superAdmin: false }, camp: CAMP, camps: [] });
    stubApi();
    act(() => {
      applyServerData({ campers: [record(KID)] as never, bedrooms: [], staff: [], categories: [], teams: [], transports: [] } as never, new Date().toISOString());
      rememberPeople([{ personId: KID, name: "Ana Paz", nickname: null, sex: "F" }]);
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    act(() => clearStore());
  });

  it("CamperDetail", async () => {
    render(
      <I18nProvider>
        <ConfirmProvider>
          <CamperDetail token="tok" camperId={KID} nav={{ crumbs: [], setTitle: () => {} }} onEdit={() => {}} canEditHealth />
        </ConfirmProvider>
      </I18nProvider>,
    );
    expect(await screen.findByText("Não disponível para o seu perfil.")).toBeInTheDocument();
    expect(screen.queryByText("Nada de saúde declarado.")).toBeNull();
    // a block this profile may not read is never offered for editing
    expect(screen.queryByRole("button", { name: "Editar saúde" })).toBeNull();
  });

  it("CheckinPage dialog", async () => {
    const kid = { ...record(KID), name: "Ana Paz", nickname: null, sex: "F" } as unknown as Camper;
    render(
      <I18nProvider>
        <ConfirmProvider>
          <CheckinDialog token="tok" camper={kid} bedroom={null} sex="girl" labelOf={() => null} busy={false} onConfirm={() => {}} onCancel={() => {}} />
        </ConfirmProvider>
      </I18nProvider>,
    );
    expect(await screen.findByText("🩺 Saúde: não disponível para o seu perfil.")).toBeInTheDocument();
    expect(screen.getByText("não disponível para o seu perfil")).toBeInTheDocument();
    expect(screen.queryByText(/nada (declarado|informado)/i)).toBeNull();
  });
});
