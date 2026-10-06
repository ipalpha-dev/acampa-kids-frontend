import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { saveAuth } from "../../auth/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import { applyServerData, clearStore } from "../../store";
import { rememberPeople } from "../../store/people";
import { EMPTY_HEALTH, type Camper } from "../../api/campers";
import ParentHomePage from "./ParentHomePage";
import AttentionEditDialog from "./AttentionEditDialog";
import type { LoggedUser } from "../../roles";

/** Decision 52 / §19: a responsável reads and edits their own kids' health through IPAlpha's own-kids rule. */
const CAMP = { id: "c1", label: "Acampa Kids 2026", year: 2026, active: true };
const KID = "k1";
const USER: LoggedUser = { id: "p1", personId: "p1", name: "Rosa Paz", roles: ["responsavel"], activeRole: "responsavel", audience: "parent", superAdmin: false };
const ACCESS = { open: false, checkin: false, opensAt: null, closesAt: null };

function record(id: string) {
  return { id, personId: id, invitedBy: "", caretakerId: null, qrToken: "", team: null, transportation: null, bed: null, bedroom: null, generalNotes: "", bedroomPreference: "", checkin: null, busCheckin: null, busReturnCheckin: null, createdAt: "", parentEditedAt: null, importId: null, updatedAt: "" };
}

function signIn() {
  saveAuth({ token: "tok", tokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(), user: USER, camp: CAMP, camps: [] });
}

function stubApi(camper: Record<string, unknown>, put?: () => Response) {
  const calls: { method: string; path: string }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), window.location.origin);
    calls.push({ method: init?.method ?? "GET", path: url.pathname });
    if (url.pathname === "/api/people/health-lists") return Response.json({ lists: [] });
    if (url.pathname === `/api/campers/${KID}` && (init?.method ?? "GET") === "GET") return Response.json({ camper: { ...record(KID), name: "Ana Paz", nickname: null, sex: null, responsibles: [], ...camper } });
    if (url.pathname === `/api/campers/${KID}/parent` && put) return put();
    return Response.json({ error: { code: "NOT_FOUND", message: "x" } }, { status: 404 });
  }));
  return calls;
}

describe("parent health (decision 52)", () => {
  beforeEach(() => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["pt-BR"]);
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
    signIn();
    act(() => {
      applyServerData({ campers: [record(KID)] as never, bedrooms: [], staff: [], categories: [], teams: [], transports: [] } as never, new Date().toISOString());
      rememberPeople([{ personId: KID, name: "Ana Paz", nickname: null, sex: null }]);
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    act(() => clearStore());
  });

  it("shows the kid's health read live and lets the family edit it", async () => {
    stubApi({ health: { ...EMPTY_HEALTH, healthNotes: "asma leve" } });
    render(<I18nProvider><ParentHomePage user={USER as never} token="tok" access={ACCESS} /></I18nProvider>);
    expect(await screen.findByText(/asma leve/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Editar/ })).toBeEnabled();
  });

  it("when IPAlpha refuses this profile it says so gently — never 'nothing informed' — and offers no edit", async () => {
    stubApi({ health: null, healthForbidden: true });
    render(<I18nProvider><ParentHomePage user={USER as never} token="tok" access={ACCESS} /></I18nProvider>);
    expect(await screen.findByText(/não estão disponíveis para o seu perfil agora/)).toBeInTheDocument();
    expect(screen.queryByText("Nenhuma alergia, condição ou medicação informada.")).toBeNull();
    expect(screen.getByRole("button", { name: /Editar/ })).toBeDisabled();
  });

  it("an edit IPAlpha refuses (403) tells the family nothing was changed", async () => {
    stubApi({}, () => Response.json({ error: { code: "CORE_FORBIDDEN", reason: "medicalForbidden", message: "O IPAlpha não permitiu esta operação para o seu perfil." } }, { status: 403 }));
    const onClose = vi.fn();
    const kid = { ...record(KID), name: "Ana Paz" } as unknown as Camper;
    render(<I18nProvider><AttentionEditDialog token="tok" open camper={kid} health={{ ...EMPTY_HEALTH }} generalNotes="" onClose={onClose} /></I18nProvider>);
    fireEvent.change(screen.getByPlaceholderText("ex.: 28,5"), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(screen.getByText(/Nada foi alterado — fale com a coordenação/)).toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
  });
});
