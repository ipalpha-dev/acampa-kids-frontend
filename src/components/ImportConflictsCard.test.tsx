import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ImportConflict } from "../api/imports";
import { saveAuth } from "../auth/store";
import { I18nProvider } from "../i18n";
import { applyServerData, clearStore } from "../store";
import { clearPeople } from "../store/people";
import ImportConflictsCard from "./ImportConflictsCard";

const BUS = { id: "bus-1", kind: "bus", name: null, number: "1", color: null, order: 0 };
const CAR = { id: "car-1", kind: "car", name: "Carro do João", number: null, color: null, order: 1 };

const CONFLICTS: ImportConflict[] = [
  { id: "c1", personId: "p-ana", field: "transportation", importValue: "bus-1", currentValue: "car-1", importId: "imp-1", createdAt: "2026-10-05T10:00:00Z" },
  { id: "c2", personId: "p-bia", field: "generalNotes", importValue: "gosta de desenhar", currentValue: "chega sábado", importId: "imp-1", createdAt: "2026-10-05T10:00:00Z" },
];

function stubBackend(initial: ImportConflict[], failed: { id: string; code: string; message: string }[] = []) {
  let items = [...initial];
  const calls: { method: string; path: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), window.location.origin);
      const method = (init?.method ?? "GET").toUpperCase();
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ method, path: url.pathname + url.search, body });
      const json = (b: unknown, status = 200) => Response.json(b, { status });
      if (url.pathname === "/api/import-conflicts") return json({ items });
      if (url.pathname === "/api/import-conflicts/resolve") {
        const { ids, choice } = body as { ids: string[]; choice: string };
        const failedIds = new Set(failed.map((f) => f.id));
        items = items.filter((i) => !ids.includes(i.id) || failedIds.has(i.id));
        const done = ids.filter((id) => !failedIds.has(id)).length;
        return json({ applied: choice === "import" ? done : 0, kept: choice === "keep" ? done : 0, failed });
      }
      if (url.pathname === "/api/people/names") {
        const ids = (body as { personIds: string[] }).personIds;
        const known: Record<string, string> = { "p-ana": "Ana Paz", "p-bia": "Bia Rios" };
        return json({ items: ids.filter((id) => known[id]).map((id) => ({ personId: id, name: known[id], nickname: null, sex: null })) });
      }
      return json({ error: { code: "NOT_FOUND", message: "x" } }, 404);
    }),
  );
  return calls;
}

function renderCard(subject: "camper" | "team" = "camper") {
  return render(
    <I18nProvider>
      <ImportConflictsCard token="tok" subject={subject} />
    </I18nProvider>,
  );
}

describe("Valores da importação para conferir (decision 78)", () => {
  beforeEach(() => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["pt-BR"]);
    saveAuth({ token: "tok", tokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(), user: { id: "me", personId: "me", name: "Eu", roles: ["coordenacao"], activeRole: "coordenacao", audience: "admin", superAdmin: false }, camp: { id: "c1", label: "Acampa Kids 2026", year: 2026, active: true }, camps: [] });
    act(() => applyServerData({ transports: [BUS, CAR] as never }, new Date().toISOString()));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    clearPeople();
    clearStore();
  });

  it("shows each kept-aside value next to the current one, with the camp's own labels and the person's live name", async () => {
    const calls = stubBackend(CONFLICTS);
    renderCard();
    const card = await screen.findByRole("region", { name: "Valores da importação para conferir" });
    expect(await within(card).findByText("Ana Paz")).toBeInTheDocument();
    expect(within(card).getByText("Ônibus 1")).toBeInTheDocument();
    expect(within(card).getByText("Carro do João")).toBeInTheDocument();
    expect(within(card).getByText("“gosta de desenhar”")).toBeInTheDocument();
    expect(within(card).getByText("“chega sábado”")).toBeInTheDocument();
    expect(calls[0].path).toBe("/api/import-conflicts?subject=camper");
  });

  it("“Aplicar valor da importação” / “Manter o atual” go to the backend and the item leaves the list", async () => {
    const calls = stubBackend(CONFLICTS);
    renderCard();
    await screen.findByText("Ana Paz");
    fireEvent.click(screen.getByRole("button", { name: "Aplicar valor da importação para Ana Paz (Transporte)" }));
    await waitFor(() => expect(screen.queryByText("Ônibus 1")).toBeNull());
    expect(calls.find((c) => c.method === "POST" && c.path === "/api/import-conflicts/resolve")?.body).toEqual({ ids: ["c1"], choice: "import" });
    fireEvent.click(screen.getByRole("button", { name: "Manter o atual para Bia Rios (Observações)" }));
    await waitFor(() => expect(calls.filter((c) => c.method === "POST" && c.path === "/api/import-conflicts/resolve")).toHaveLength(2));
    expect(calls.filter((c) => c.method === "POST" && c.path === "/api/import-conflicts/resolve")[1].body).toEqual({ ids: ["c2"], choice: "keep" });
    // nothing left: the card shrinks away (hidden from everyone, its last content fading out)
    await waitFor(() => expect(screen.queryByRole("region", { name: "Valores da importação para conferir" })).toBeNull());
  });

  it("all at once; a refusal (full room) is said gently and the item stays", async () => {
    const calls = stubBackend(CONFLICTS, [{ id: "c1", code: "BEDROOM_FULL", message: "lotado" }]);
    renderCard();
    await screen.findByText("Ana Paz");
    fireEvent.click(screen.getByRole("button", { name: "Aplicar todos da importação" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Esse quarto já está lotado. Libere uma cama ou mantenha o atual.");
    expect(calls.find((c) => c.method === "POST" && c.path === "/api/import-conflicts/resolve")?.body).toEqual({ ids: ["c1", "c2"], choice: "import" });
    await waitFor(() => expect(screen.queryByText("“gosta de desenhar”")).toBeNull());
    expect(screen.getByText("Ônibus 1")).toBeInTheDocument();
  });

  it("nothing to decide: nothing shows (team page asks for the team's fields)", async () => {
    const calls = stubBackend([]);
    renderCard("team");
    await waitFor(() => expect(calls.some((c) => c.path === "/api/import-conflicts?subject=team")).toBe(true));
    expect(screen.queryByRole("button", { name: /Manter o atual/ })).toBeNull();
  });
});
