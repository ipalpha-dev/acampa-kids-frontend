import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ImportReview, ImportView, ResultBatch } from "../../api/imports";
import { saveAuth } from "../../auth/store";
import { ConfirmProvider } from "../../components/ConfirmDialog";
import { I18nProvider } from "../../i18n";
import { clearPeople } from "../../store/people";
import { IMPORT_BATCH_EVENT, IMPORT_PROGRESS_EVENT } from "../../store/realtime";
import ImportPage, { failureOf, forgetOpenImports, reasonLabel } from "./ImportPage";

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
    failureReason: null,
    steps: [{ name: "read", done: 1, total: 3 }],
    file: { name: "kids.xlsx", size: 2048, sheet: "Planilha1" },
    mapping: {},
    fields: [],
    reviews: [],
    appFields: [TRANSPORT, BEDROOM],
    counts: { rows: 3, pending: 0, batches: 0, created: 0, updated: 0, skipped: 0, failed: 0 },
    applied: { batches: 0 },
    createdAt: null,
    expiresAt: null,
    ...over,
  };
}

const review = (over: Partial<ImportReview> & Pick<ImportReview, "id" | "kind">): ImportReview => ({
  blocking: false,
  options: [],
  rowRef: null,
  rowRefs: [],
  field: null,
  who: null,
  basis: null,
  existingPersonId: null,
  firstRowRef: null,
  choice: null,
  value: null,
  rows: null,
  resolved: false,
  context: {},
  ...over,
});

/** persons-api's questions, as the backend passes them through */
const MATCH = review({ id: "match:4:person", kind: "match", blocking: true, options: ["match", "new", "skip"], rowRef: 4, who: "person", basis: "nameBirthDate", existingPersonId: "p-ana", context: { name: "Ana P." } });
const CATEGORY = review({ id: "category:transportation:0", kind: "category", options: ["bus-1", "car", "none"], field: "app:transportation", rowRefs: [2, 3], context: { value: "Bus 1" } });
const REQUIRED = review({ id: "required:transportation", kind: "required", blocking: true, options: ["default", "skip"], field: "app:transportation", rowRefs: [5, 6] });
const INVALID = review({ id: "invalid:7:birthDate", kind: "invalid", blocking: true, options: ["value", "skip"], rowRef: 7, field: "birthDate", context: { name: "Bia", original: "31/02/2016" } });

const REVIEW = importView({
  status: "review",
  steps: [{ name: "read", done: 3, total: 3 }, { name: "columns", done: 1, total: 1 }],
  mapping: { Nome: "name", Ônibus: null },
  fields: ["name", "birthDate", "app:transportation"],
  reviews: [MATCH, CATEGORY, REQUIRED, INVALID],
  counts: { rows: 3, pending: 3, batches: 0, created: 0, updated: 0, skipped: 0, failed: 0 },
});

const DONE = importView({
  status: "done",
  steps: [{ name: "apply", done: 1, total: 1 }],
  counts: { rows: 3, pending: 0, batches: 1, created: 1, updated: 1, skipped: 1, failed: 0 },
  applied: { batches: 1 },
});

const RESULTS: ResultBatch[] = [
  {
    batch: 1,
    rows: [
      { rowRef: "2", personId: "p-ana", status: "created", reason: null, appFields: { transportation: "bus-1" }, unfilled: ["bedroom"] },
      { rowRef: "3", personId: "p-bia", status: "updated", reason: null, appFields: { transportation: "car", bedroom: "r1" }, unfilled: [] },
      { rowRef: "4", personId: null, status: "skipped", reason: "requiredFieldSkipped", appFields: {}, unfilled: ["transportation"] },
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
        // persons-api's shape: each decided review becomes resolved, `pending` = blocking ones still open
        const d = body as { reviews?: { id: string; choice?: string; value?: string }[] };
        const reviews = current.reviews.map((r) => {
          const hit = d.reviews?.find((x) => x.id === r.id);
          return hit ? { ...r, choice: hit.choice ?? r.choice, value: hit.value ?? r.value, resolved: true } : r;
        });
        current = { ...current, reviews, counts: { ...current.counts, pending: reviews.filter((r) => r.blocking && !r.resolved).length } };
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

  it("upload → live steps → persons-api's questions gate Apply → results with gentle reasons and the unfilled fields", async () => {
    const backend = stubBackend();
    renderPage();

    // pick: Acampa's own fields are announced, the file goes as multipart with the subject
    expect(await screen.findByText(/Transporte/)).toBeInTheDocument();
    expect(screen.getByText(/2º responsável/)).toBeInTheDocument();
    const input = screen.getByLabelText("Escolher planilha") as HTMLInputElement;
    const file = new File(["nome;onibus"], "kids.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar planilha" }));
    expect(await screen.findByText("O IPAlpha está lendo a planilha…")).toBeInTheDocument();
    const post = backend.calls.find((c) => c.method === "POST" && c.path === "/api/imports");
    expect(post?.body).toBeInstanceOf(FormData);
    expect((post?.body as FormData).get("subject")).toBe("camper");
    expect(screen.getByText("Lendo a planilha")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "33");

    // IPAlpha finished reading: the progress event makes the page re-read the import
    backend.set(REVIEW);
    act(() => {
      window.dispatchEvent(new CustomEvent(IMPORT_PROGRESS_EVENT, { detail: { importId: "imp-1", step: "observations", done: 3, total: 3, status: "review" } }));
    });
    expect(await screen.findByText("Confira antes de gravar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gravar no IPAlpha" })).toBeDisabled();
    expect(screen.getByText("Para gravar, responda 3 pergunta(s) marcada(s) acima.")).toBeInTheDocument();
    expect(screen.getByText("Transporte: 2 linha(s) sem valor")).toBeInTheDocument();
    // the match shows only the existing person's name from the people cache (id → name), the row's name from the file
    expect(await screen.findByText(/parece ser Ana Paz, já cadastrado\(a\)/)).toBeInTheDocument();

    // each answer goes as persons-api's own shape {reviews:[{id, choice, value?}]}
    fireEvent.click(screen.getByRole("button", { name: "É a mesma pessoa" }));
    fireEvent.click(screen.getByRole("radio", { name: "Não importar essas linhas agora" }));
    fireEvent.change(screen.getByLabelText("Valor correto de Data de nascimento"), { target: { value: "28/02/2016" } });
    fireEvent.click(screen.getByRole("button", { name: "Usar este valor" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Gravar no IPAlpha" })).toBeEnabled());
    const patches = backend.calls.filter((c) => c.method === "PATCH").map((c) => c.body);
    expect(patches).toEqual([
      { reviews: [{ id: "match:4:person", choice: "match" }] },
      { reviews: [{ id: "required:transportation", choice: "skip" }] },
      { reviews: [{ id: "invalid:7:birthDate", choice: "value", value: "28/02/2016" }] },
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Gravar no IPAlpha" }));
    expect(await screen.findByText("Gravando no IPAlpha…")).toBeInTheDocument();
    expect(backend.calls.some((c) => c.method === "POST" && c.path === "/api/imports/imp-1/apply")).toBe(true);

    // a batch landed (one value kept aside by a manual edit) and the import is over
    backend.set(DONE);
    act(() => {
      window.dispatchEvent(new CustomEvent(IMPORT_BATCH_EVENT, { detail: { importId: "imp-1", batch: 1, rows: 3, applied: 2, skipped: 1, unfilled: 2, conflicts: 1 } }));
    });
    expect(await screen.findByText("Importação concluída 🎉")).toBeInTheDocument();
    expect(screen.getByText(/1 valor\(es\) da planilha não substituíram/)).toBeInTheDocument();
    const results = await screen.findByRole("region", { name: "Resultado da importação" });
    expect(await within(results).findByText("Ana Paz")).toBeInTheDocument();
    expect(within(results).getByText("Bia Rios")).toBeInTheDocument();
    expect(within(results).getByText("Ficou sem: Quarto")).toBeInTheDocument();
    expect(within(results).getByText("Ficou sem: Transporte")).toBeInTheDocument();
    // gentle wording: a skipped row is "não importado agora", with the reason in words (never the code)
    expect(within(results).getByText("Não importado agora")).toBeInTheDocument();
    expect(within(results).getByText("Ficou para depois: um campo obrigatório estava em branco.")).toBeInTheDocument();
    expect(within(results).queryByText("requiredFieldSkipped")).toBeNull();
  });

  it("a category value is mapped to one of the camp's options; a failed apply can continue where it stopped", async () => {
    const backend = stubBackend();
    backend.set(REVIEW);
    forgetOpenImports();
    renderPage();
    // open the remembered import through the upload path
    fireEvent.change(screen.getByLabelText("Escolher planilha"), { target: { files: [new File(["x"], "kids.csv")] } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar planilha" }));
    expect(await screen.findByText("Confira antes de gravar")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Valores da planilha → opções do Acampa/ }));
    fireEvent.change(screen.getByLabelText("Transporte: Bus 1"), { target: { value: "bus-1" } });
    await waitFor(() => expect(backend.calls.some((c) => c.method === "PATCH")).toBe(true));
    expect(backend.calls.find((c) => c.method === "PATCH")?.body).toEqual({ reviews: [{ id: "category:transportation:0", choice: "bus-1" }] });

    backend.set(importView({ status: "failed", failureReason: "projectsUnavailable", counts: { ...DONE.counts } }));
    act(() => {
      window.dispatchEvent(new CustomEvent(IMPORT_PROGRESS_EVENT, { detail: { importId: "imp-1", step: "apply", done: 1, total: 2, status: "failed" } }));
    });
    expect(await screen.findByText("Não foi possível terminar esta importação")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continuar gravando" }));
    await waitFor(() => expect(backend.calls.some((c) => c.method === "POST" && c.path === "/api/imports/imp-1/apply")).toBe(true));
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

describe("persons-api failure reasons (decisions 75, 81)", () => {
  const tx = (pt: string) => pt;
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

  it("a refused membership on a row is said gently; other row reasons keep their own line", () => {
    expect(reasonLabel(tx, "membership:conflict")).toBe("O IPAlpha não aceitou a inscrição desta pessoa no acampamento.");
    expect(reasonLabel(tx, "email:phoneOrEmailTaken,membership:unknownRole")).toBe("O IPAlpha não aceitou a inscrição desta pessoa no acampamento.");
    expect(reasonLabel(tx, "cannotLinkSelf")).toBe("Quem importa não pode ser o responsável nesta mesma importação.");
    expect(reasonLabel(tx, "somethingNew")).toBe("Não deu certo desta vez.");
  });

  it("a stopped run: transient and importer refusals resume; edition / setup refusals and a failed reading do not", () => {
    for (const r of ["projectsUnavailable", "interrupted", "internalError", "membership:roleNotHeld", "membership:outsideWindow", "membership:noGrant"]) expect(failureOf(tx, r).resumable).toBe(true);
    for (const r of ["analysisFailed", null, "membership:unknownEdition", "projectsRefused", "projectNotFound"]) expect(failureOf(tx, r).resumable).toBe(false);
    expect(failureOf(tx, "membership:outsideWindow").text).toContain("período de inscrições");
    expect(failureOf(tx, "membership:roleNotHeld").text).toContain("Seu perfil no IPAlpha");
  });

  it("shows why the run stopped and offers no 'Continuar gravando' when applying again cannot help", async () => {
    const backend = stubBackend();
    backend.set(importView({ status: "failed", failureReason: "membership:unknownEdition", counts: { ...DONE.counts } }));
    forgetOpenImports();
    renderPage();
    fireEvent.change(screen.getByLabelText("Escolher planilha"), { target: { files: [new File(["x"], "kids.csv")] } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar planilha" }));
    expect(await screen.findByText(/não aceitou mais inscrições nesta edição/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continuar gravando" })).toBeNull();
  });
});
