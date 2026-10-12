import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveAuth } from "../../auth/store";
import { ConfirmProvider } from "../../components/ConfirmDialog";
import { I18nProvider } from "../../i18n";
import ImportPage, { forgetOpenImports } from "./ImportPage";

/** Kevyn 2026-10-12: the kids' import carries a job-level "the families accepted it on the enrollment form" checkbox. */
const CAMP = { id: "c1", label: "Acampa Kids 2026", year: 2026, active: true };
const DOC = { document: "camp-authorization", version: 2, title: { "pt-BR": "Autorização do acampamento", "en-US": "Camp authorization" }, markdown: "# Cuidado\n\nAutorizo a **participação**.\n\n<b>sem html</b>" };
const VIEW = { id: "imp-1", subject: "camper", status: "analysing", failureReason: null, steps: [], file: { name: "kids.csv", size: 10, sheet: null }, mapping: {}, fields: [], reviews: [], appFields: [], counts: { rows: 1, pending: 0, batches: 0, created: 0, updated: 0, skipped: 0, failed: 0 }, applied: { batches: 0 }, createdAt: null, expiresAt: null };

function stub(opts: { docs?: unknown[]; postAnswer?: () => Response } = {}) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  let docs = opts.docs ?? [DOC];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), window.location.origin);
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ method, path: url.pathname, body: init?.body ?? null });
      if (url.pathname === "/api/imports/app-fields") return Response.json({ subject: "camper", appFields: [] });
      if (url.pathname === "/api/imports/consent-documents") return Response.json({ documents: docs });
      if (url.pathname === "/api/imports" && method === "POST") return opts.postAnswer ? opts.postAnswer() : Response.json({ import: VIEW }, { status: 201 });
      if (url.pathname === "/api/imports/imp-1") return Response.json({ import: VIEW });
      return Response.json({ error: { code: "NOT_FOUND", message: "x" } }, { status: 404 });
    }),
  );
  return { calls, setDocs: (next: unknown[]) => (docs = next) };
}

const page = (subject: "camper" | "team" = "camper") =>
  render(
    <I18nProvider>
      <ConfirmProvider>
        <ImportPage token="tok" subject={subject} onDone={() => {}} />
      </ConfirmProvider>
    </I18nProvider>,
  );

const LABEL = "As famílias aceitaram o documento Autorização do acampamento v2 no formulário de inscrição";

function send() {
  fireEvent.change(screen.getByLabelText("Escolher planilha"), { target: { files: [new File(["nome\nAna"], "kids.csv", { type: "text/csv" })] } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar planilha" }));
}
const posted = (calls: { method: string; path: string; body: unknown }[]) => calls.find((c) => c.method === "POST" && c.path === "/api/imports")?.body as FormData;

describe("import: enrollment authorization checkbox", () => {
  beforeEach(() => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["pt-BR"]);
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
    saveAuth({ token: "tok", tokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(), user: { id: "me", personId: "me", name: "Eu", roles: ["coordenacao"], activeRole: "coordenacao", audience: "admin", superAdmin: false }, camp: CAMP, camps: [] });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    forgetOpenImports();
  });

  it("offers the edition's document at its current version, unchecked by default; the text reads as text (never HTML)", async () => {
    const { calls } = stub();
    const { container } = page();
    const box = await screen.findByRole("checkbox", { name: LABEL });
    expect(box).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Ler o texto" }));
    const text = screen.getByRole("document", { name: "Autorização do acampamento" });
    expect(text).toHaveTextContent("Autorizo a participação.");
    expect(text).toHaveTextContent("<b>sem html</b>");
    expect(container.querySelector(".link-btn + div b")).toBeNull();
    // unchecked: the import goes without `consents`
    send();
    await waitFor(() => expect(posted(calls)).toBeInstanceOf(FormData));
    expect(posted(calls).get("consents")).toBeNull();
  });

  it("checked: `consents` [{document, version}] travels with the kids' import", async () => {
    const { calls } = stub();
    page();
    fireEvent.click(await screen.findByRole("checkbox", { name: LABEL }));
    send();
    await waitFor(() => expect(posted(calls)).toBeInstanceOf(FormData));
    expect(JSON.parse(String(posted(calls).get("consents")))).toEqual([{ document: "camp-authorization", version: 2 }]);
  });

  it("a version published meanwhile: the error reads gently, the new version is offered and the old tick is dropped", async () => {
    const backend = stub({ postAnswer: () => Response.json({ error: { code: "CONSENT_VERSION_CHANGED", message: "O texto da autorização foi atualizado. Leia a nova versão, por favor.", currentVersion: 3 } }, { status: 409 }) });
    page();
    fireEvent.click(await screen.findByRole("checkbox", { name: LABEL }));
    backend.setDocs([{ ...DOC, version: 3 }]);
    send();
    expect(await screen.findByText("O texto da autorização foi atualizado. Leia a nova versão, por favor.")).toBeInTheDocument();
    const fresh = await screen.findByRole("checkbox", { name: LABEL.replace("v2", "v3") });
    expect(fresh).not.toBeChecked();
  });

  it("no document required (or a team import): no checkbox at all", async () => {
    stub({ docs: [] });
    page();
    await screen.findByLabelText("Escolher planilha");
    await waitFor(() => expect(screen.queryByRole("checkbox")).toBeNull());
    stub();
    page("team");
    await waitFor(() => expect(screen.getAllByLabelText("Escolher planilha").length).toBeGreaterThan(0));
    expect(screen.queryByRole("checkbox", { name: LABEL })).toBeNull();
  });
});
