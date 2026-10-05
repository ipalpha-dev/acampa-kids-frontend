import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveAuth } from "../auth/store";
import { I18nProvider } from "../i18n";
import LinkRequestDialog from "../pages/admin/LinkRequestDialog";
import LinkRequestsCard from "./LinkRequestsCard";

/** Decision 80 / CONTRACTS §25: the coordenação proposes another responsável; the family accepts or declines. */
const CAMP = { id: "c1", label: "Acampa Kids 2026", year: 2026, active: true };

const REQUEST = {
  id: "lr-1",
  childId: "kid-1",
  proposedResponsibleId: "p-marta",
  projectName: "Acampa Kids",
  status: "pending",
  createdAt: null,
  expiresAt: null,
  child: { name: "Lia Paz", nickname: null, sex: "female" },
  proposedResponsible: { name: "Marta Souza", nickname: null, sex: "female" },
};

type Call = { method: string; path: string; body: unknown };

function stubApi(answers: Record<string, () => Response>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), window.location.origin);
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ method, path: url.pathname, body: init?.body ? JSON.parse(String(init.body)) : null });
      const answer = answers[`${method} ${url.pathname}`];
      return answer ? answer() : Response.json({ error: { code: "NOT_FOUND", message: "x" } }, { status: 404 });
    }),
  );
  return calls;
}

const ui = (node: React.ReactNode) => render(<I18nProvider>{node}</I18nProvider>);

describe("another responsável (decision 80)", () => {
  beforeEach(() => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["pt-BR"]);
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
    saveAuth({
      token: "tok",
      tokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
      user: { id: "me", personId: "me", name: "Eu", roles: ["coordenacao"], activeRole: "coordenacao", audience: "admin", superAdmin: false },
      camp: CAMP,
      camps: [],
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("the coordenação sends a request (not a link): name + phone go to /api/link-requests and the family is told it decides", async () => {
    const calls = stubApi({
      "POST /api/link-requests": () =>
        Response.json({ request: { id: "lr-1", childId: "kid-1", status: "pending", expiresAt: null }, responsible: { personId: "p-marta", created: true } }, { status: 201 }),
    });
    ui(<LinkRequestDialog token="tok" open camperId="kid-1" camperName="Lia Paz" onClose={() => {}} />);
    expect(screen.getByText("Mais alguém cuida de Lia?")).toBeInTheDocument();
    expect(screen.getByText(/Nada é compartilhado antes disso/)).toBeInTheDocument();
    const send = screen.getByRole("button", { name: "Enviar pedido" });
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("ex.: Daniela Sparvoli"), { target: { value: "Marta Souza" } });
    fireEvent.change(screen.getByLabelText("Celular com DDD"), { target: { value: "11977776666" } });
    await waitFor(() => expect(send).toBeEnabled());
    fireEvent.click(send);
    expect(await screen.findByText("Pedido enviado")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ camperId: "kid-1", name: "Marta Souza", phone: "+5511977776666" });
  });

  it("core's refusal is said gently (requestPending)", async () => {
    stubApi({ "POST /api/link-requests": () => Response.json({ error: { code: "LINK_REQUEST_REFUSED", reason: "requestPending", message: "x" } }, { status: 409 }) });
    ui(<LinkRequestDialog token="tok" open camperId="kid-1" camperName="Lia Paz" onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("ex.: Daniela Sparvoli"), { target: { value: "Marta Souza" } });
    fireEvent.change(screen.getByLabelText("Celular com DDD"), { target: { value: "11977776666" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    expect(await screen.findByText("Já existe um pedido para esta pessoa esperando a resposta da família.")).toBeInTheDocument();
  });

  it("the family sees the pending request and accepts it", async () => {
    const calls = stubApi({
      "GET /api/link-requests/mine": () => Response.json({ items: [REQUEST] }),
      "POST /api/link-requests/lr-1/accept": () => Response.json({ request: { id: "lr-1", childId: "kid-1", status: "accepted" } }),
    });
    ui(<LinkRequestsCard token="tok" />);
    expect(await screen.findByText("Marta também cuida de Lia?")).toBeInTheDocument();
    expect(screen.getByText(/como outro responsável por Lia/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Aceitar" }));
    expect(await screen.findByText("Pronto! Marta agora também cuida de Lia.")).toBeInTheDocument();
    expect(calls.some((c) => c.method === "POST" && c.path === "/api/link-requests/lr-1/accept")).toBe(true);
    expect(screen.getByRole("button", { name: "Aceitar", hidden: true })).toBeDisabled();
  });

  it("decline shares nothing; an answer someone else already gave is said gently", async () => {
    stubApi({
      "GET /api/link-requests/mine": () => Response.json({ items: [REQUEST, { ...REQUEST, id: "lr-2" }] }),
      "POST /api/link-requests/lr-1/decline": () => Response.json({ request: { id: "lr-1", childId: "kid-1", status: "declined" } }),
      "POST /api/link-requests/lr-2/accept": () => Response.json({ error: { code: "CORE_REJECTED", reason: "requestNotPending", message: "x" } }, { status: 409 }),
    });
    ui(<LinkRequestsCard token="tok" />);
    await screen.findAllByText("Marta também cuida de Lia?");
    fireEvent.click(screen.getAllByRole("button", { name: "Recusar" })[0]);
    expect(await screen.findByText("Tudo bem, o pedido foi recusado. Nada foi compartilhado.")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Aceitar" })[1]);
    expect(await screen.findByText("Este pedido já foi respondido ou não vale mais.")).toBeInTheDocument();
  });

  it("no request → no card", async () => {
    const calls = stubApi({ "GET /api/link-requests/mine": () => Response.json({ items: [] }) });
    ui(<LinkRequestsCard token="tok" />);
    await waitFor(() => expect(calls.length).toBe(1));
    expect(screen.queryByText("Pedido para a família")).toBeNull();
  });
});
