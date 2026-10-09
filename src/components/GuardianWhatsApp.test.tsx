import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveAuth } from "../auth/store";
import { I18nProvider } from "../i18n";
import GuardianWhatsApp from "./GuardianWhatsApp";

const CAMP = { id: "c1", label: "Acampa", year: 2026, active: true };

function stubApi(responsibles: { status: number; body: unknown }) {
  const paths: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input), window.location.origin).pathname;
    paths.push(path);
    if (path === "/api/campers/k1/responsibles") return Response.json(responsibles.body, { status: responsibles.status });
    if (path === "/api/people/r1/data/phone") return Response.json({ personId: "r1", kind: "phone", data: { e164: "+5511981234567" } });
    return Response.json({ error: { code: "NOT_FOUND", message: "not found" } }, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return paths;
}

function renderButton() {
  return render(
    <I18nProvider>
      <GuardianWhatsApp camper={{ id: "k1", name: "Ana Souza" }} />
    </I18nProvider>,
  );
}

describe("GuardianWhatsApp — family contact without a health read", () => {
  beforeEach(() => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["pt-BR"]);
    saveAuth({ token: "tok", tokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(), user: { id: "p", personId: "p", name: "Marta", roles: ["equipe"], activeRole: "equipe", audience: "staff", superAdmin: false }, camp: CAMP, camps: [] });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("reads nothing until the tap; then only the responsáveis route (never GET /api/campers/:id) and each phone", async () => {
    const paths = stubApi({ status: 200, body: { camper: { id: "k1", name: "Ana Souza" }, responsibles: [{ personId: "r1", name: "Marcela Souza" }] } });
    renderButton();
    expect(paths).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Falar com a família de Ana" }));
    const link = await screen.findByRole("link", { name: "Falar com Marcela no WhatsApp" });
    expect(link.getAttribute("href")).toContain("5511981234567");
    expect(paths).toEqual(["/api/campers/k1/responsibles", "/api/people/r1/data/phone"]);
    expect(paths).not.toContain("/api/campers/k1");
  });

  it("a kid out of scope (404 CAMPER_NOT_FOUND) shows the gentle note", async () => {
    stubApi({ status: 404, body: { error: { code: "CAMPER_NOT_FOUND", message: "Criança não encontrada." } } });
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: "Falar com a família de Ana" }));
    expect(await screen.findByText("Não foi possível ver o contato agora.")).toBeInTheDocument();
  });

  it("a role IPAlpha does not show the responsáveis gets a gentle note, never 'nobody'", async () => {
    stubApi({ status: 200, body: { camper: { id: "k1", name: "Ana Souza" }, responsibles: [], responsiblesHidden: true } });
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: "Falar com a família de Ana" }));
    expect(await screen.findByText("Os responsáveis desta criança não aparecem para o seu perfil. A coordenação pode ajudar.")).toBeInTheDocument();
    expect(screen.queryByText("Nenhum responsável visível.")).toBeNull();
  });
});
