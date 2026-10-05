import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ImportView, ResultBatch } from "../../api/imports";
import { saveAuth } from "../../auth/store";
import { ConfirmProvider } from "../../components/ConfirmDialog";
import { I18nProvider } from "../../i18n";
import { clearPeople } from "../../store/people";
import { IMPORT_BATCH_EVENT, IMPORT_PROGRESS_EVENT } from "../../store/realtime";
import ImportPage, { forgetOpenImports } from "./ImportPage";

const CAMP = { id: "c1", label: "Acampa Kids 2026", year: 2026, active: true };

const TRANSPORT = {
  key: "transportation",
  description: "Como a criança vai",
  kind: "category" as const,
  categories: [
    { key: "bus-1", label: "Ônibus 1" },
    { key: "car", label: "Carro" },
  ],
  required: true,
};
const BEDROOM = { key: "bedroom", description: "Quarto", kind: "category" as const, categories: [{ key: "r1", label: "Quarto 1" }], required: false };

function importView(over: Partial<ImportView> = {}): ImportView {
  return {
    id: "imp-1",
    subject: "camper",
    status: "analysing",
    steps: [{ name: "mapping", done: 1, total: 3 }],
    file: { name: "kids.xlsx", size: 2048, sheet: "Planilha1" },
    mapping: {},
    fields: [],
    reviews: [],
    appFields: [],
    pendingRequired: [],
    counts: { rows: 3, created: 0, updated: 0, skipped: 0, failed: 0 },
    applied: { batches: 0, rows: 0 },
    createdAt: null,
    expiresAt: null,
    ...over,
  };
}

const REVIEW = importView({
  status: "review",
  steps: [{ name: "mapping", done: 3, total: 3 }],
  mapping: { Nome: "name", Ônibus: null },
  fields: [{ key: "name", label: "Nome" }],
  appFields: [
    { ...TRANSPORT, categoryMapping: { "Bus 1": "bus-1" }, emptyRows: 2, decision: null },
    { ...BEDROOM, categoryMapping: {}, emptyRows: 0, decision: null },
  ],
  pendingRequired: ["transportation"],
});

const DONE = importView({
  status: "done",
  steps: [{ name: "applying", done: 1, total: 1 }],
  appFields: REVIEW.appFields,
  counts: { rows: 3, created: 1, updated: 1, skipped: 1, failed: 0 },
  applied: { batches: 1, rows: 3 },
});

const RESULTS: ResultBatch[] = [
  {
    batch: 1,
    rows: [
      { rowRef: "2", personId: "p-ana", status: "created", reason: null, appFields: { transportation: "bus-1" }, unfilled: ["bedroom"] },
      { rowRef: "3", personId: "p-bia", status: "updated", reason: null, appFields: { transportation: "car", bedroom: "r1" }, unfilled: [] },
      { rowRef: "4", personId: null, status: "skipped", reason: "Transporte em branco", appFields: {}, unfilled: ["transportation"] },
    ],
  },
];

interface Call {
  method: string;
  path: string;
  body: unknown;
}

function stubBackend() {
  const calls: Call[] = [];
  let current: ImportView = importView();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), window.location.origin);
      const method = (init?.method ?? "GET").toUpperCase();
      const body = init?.body instanceof FormData ? init.body : init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ method, path: url.pathname + url.search, body });
      const json = (b: unknown, status = 200) => Response.json(b, { status });
      if (url.pathname === "/api/imports/app-fields") return json({ subject: url.searchParams.get("subject"), appFields: [TRANSPORT, BEDROOM] });
      if (url.pathname === "/api/imports" && method === "POST") return json({ import: current }, 201);
      if (url.pathname === "/api/imports/imp-1" && method === "GET") return json({ import: current });
      if (url.pathname === "/api/imports/imp-1" && method === "PATCH") {
        const d = body as { required?: Record<string, { mode: string }> };
        if (d.required?.transportation?.mode === "skip") {
          current = { ...current, pendingRequired: [], appFields: current.appFields.map((f) => (f.key === "transportation" ? { ...f, decision: { mode: "skip" } } : f)) };
        }
        return json({ import: current });
      }
      if (url.pathname === "/api/imports/imp-1/apply") {
        current = { ...current, status: "applying", steps: [{ name: "applying", done: 0, total: 1 }] };
        return json({ import: current });
      }
      if (url.pathname === "/api/imports/imp-1/results") return json({ items: current.status === "done" ? RESULTS : [], nextCursor: null });
      if (url.pathname === "/api/people/names") {
        const ids = (body as { personIds: string[] }).personIds;
        const known: Record<string, string> = { "p-ana": "Ana Paz", "p-bia": "Bia Rios" };
        return json({ items: ids.filter((id) => known[id]).map((id) => ({ personId: id, name: known[id], nickname: null, sex: null })) });
      }
      return json({ error: { code: "NOT_FOUND", message: "x" } }, 404);
    }),
  );
  return {
    calls,
    set: (next: ImportView) => {
      current = next;
    },
  };
}

function renderPage() {
  return render(
    <I18nProvider>
      <ConfirmProvider>
        <ImportPage token="tok" subject="camper" onDone={() => {}} />
      </ConfirmProvider>
    </I18nProvider>,
  );
}

describe("import through IPAlpha (CONTRACTS_ACAMPA §20 / §24)", () => {
  beforeEach(() => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["pt-BR"]);
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
    saveAuth({ token: "tok", tokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(), user: { id: "me", personId: "me", name: "Eu", roles: ["coordenacao"], activeRole: "coordenacao", audience: "admin", superAdmin: false }, camp: CAMP, camps: [] });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    clearPeople();
    forgetOpenImports();
  });

  it("upload → live steps → review with the required decision gating Apply → results with the unfilled fields", async () => {
    const backend = stubBackend();
    renderPage();

    // pick: Acampa's own fields are announced, the file goes as multipart with the subject
    expect(await screen.findByText(/Transporte/)).toBeInTheDocument();
    const input = screen.getByLabelText("Escolher planilha") as HTMLInputElement;
    const file = new File(["nome;onibus"], "kids.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar planilha" }));
    expect(await screen.findByText("O IPAlpha está lendo a planilha…")).toBeInTheDocument();
    const post = backend.calls.find((c) => c.method === "POST" && c.path === "/api/imports");
    expect(post?.body).toBeInstanceOf(FormData);
    expect((post?.body as FormData).get("subject")).toBe("camper");
    expect(screen.getByText("Lendo as colunas da planilha")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "33");

    // IPAlpha finished reading: the progress event makes the page re-read the import
    backend.set(REVIEW);
    act(() => {
      window.dispatchEvent(new CustomEvent(IMPORT_PROGRESS_EVENT, { detail: { importId: "imp-1", step: "mapping", done: 3, total: 3, status: "review" } }));
    });
    expect(await screen.findByText("Confira antes de gravar")).toBeInTheDocument();
    const apply = screen.getByRole("button", { name: "Gravar no IPAlpha" });
    expect(apply).toBeDisabled();
    expect(screen.getByText("Para gravar, decida o que fazer com: Transporte.")).toBeInTheDocument();
    expect(screen.getByText("Transporte: 2 linha(s) sem valor")).toBeInTheDocument();

    // decide: don't import those rows now → PATCH only that decision → Apply unlocks
    fireEvent.click(screen.getByRole("radio", { name: "Não importar essas linhas agora" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Gravar no IPAlpha" })).toBeEnabled());
    const patch = backend.calls.find((c) => c.method === "PATCH");
    expect(patch?.body).toEqual({ required: { transportation: { mode: "skip" } } });

    fireEvent.click(screen.getByRole("button", { name: "Gravar no IPAlpha" }));
    expect(await screen.findByText("Gravando no IPAlpha…")).toBeInTheDocument();
    expect(backend.calls.some((c) => c.method === "POST" && c.path === "/api/imports/imp-1/apply")).toBe(true);

    // a batch landed and the import is over: results per batch, names resolved live, unfilled fields listed
    backend.set(DONE);
    act(() => {
      window.dispatchEvent(new CustomEvent(IMPORT_BATCH_EVENT, { detail: { importId: "imp-1", batch: 1, rows: 3, applied: 3, unfilled: 2 } }));
    });
    expect(await screen.findByText("Importação concluída 🎉")).toBeInTheDocument();
    const results = await screen.findByRole("region", { name: "Resultado da importação" });
    expect(await within(results).findByText("Ana Paz")).toBeInTheDocument();
    expect(within(results).getByText("Bia Rios")).toBeInTheDocument();
    expect(within(results).getByText("Ficou sem: Quarto")).toBeInTheDocument();
    expect(within(results).getByText("Ficou sem: Transporte")).toBeInTheDocument();
    // gentle wording: a skipped row is "não importado agora"
    expect(within(results).getByText("Não importado agora")).toBeInTheDocument();
    const names = backend.calls.find((c) => c.path === "/api/people/names");
    expect((names?.body as { personIds: string[] }).personIds.sort()).toEqual(["p-ana", "p-bia"]);
  });

  it("refuses a file that is not .xlsx / .csv before sending it", async () => {
    const backend = stubBackend();
    renderPage();
    const input = screen.getByLabelText("Escolher planilha") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "foto.png", { type: "image/png" })] } });
    expect(await screen.findByText("Use uma planilha .xlsx ou .csv.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar planilha" })).toBeDisabled();
    expect(backend.calls.some((c) => c.method === "POST")).toBe(false);
  });
});
