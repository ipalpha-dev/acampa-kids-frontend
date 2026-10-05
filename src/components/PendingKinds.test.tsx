import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import PendingKindsCard from "./PendingKindsCard";

/** Decision 87: a responsável added by an accepted link request confirms what is shared about THEMSELVES. */
const TITLE = "Confirme o que você compartilha com o acampamento";

const view = (kinds: string[]) => ({
  editionId: "ed-1",
  items: kinds.length ? [{ membershipId: "m1", kind: "involved", personId: "kid-1", role: "participante", editionId: "ed-1", granted: [], requested: kinds }] : [],
  kinds,
});

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

let n = 0;
/** a fresh session token per test: "agora não" is remembered per session for the visit */
const ui = () => render(<I18nProvider><PendingKindsCard token={`tok-${++n}`} /></I18nProvider>);

describe("pending kinds step (decision 87)", () => {
  beforeEach(() => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["pt-BR"]);
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows the step in friendly words when something is pending", async () => {
    stubApi({ "GET /api/pending-kinds": () => Response.json(view(["email", "emergencyContact", "phone"])) });
    ui();
    expect(await screen.findByText(TITLE)).toBeInTheDocument();
    expect(screen.getByText("Seu celular")).toBeInTheDocument();
    expect(screen.getByText("Seu e-mail")).toBeInTheDocument();
    expect(screen.getByText("Um contato para emergências")).toBeInTheDocument();
    expect(screen.getByText(/Nada é compartilhado antes de você confirmar/)).toBeInTheDocument();
  });

  it("nothing pending → no step", async () => {
    const calls = stubApi({ "GET /api/pending-kinds": () => Response.json(view([])) });
    ui();
    await waitFor(() => expect(calls.length).toBe(1));
    expect(screen.queryByText(TITLE)).toBeNull();
  });

  it("confirm sends exactly the shown kinds and thanks the family", async () => {
    const calls = stubApi({
      "GET /api/pending-kinds": () => Response.json(view(["email", "phone"])),
      "POST /api/pending-kinds/confirm": () => Response.json({ ...view(["email", "phone"]), confirmed: 1 }),
    });
    ui();
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar e compartilhar" }));
    expect(await screen.findByText(/Obrigado! Agora a equipe pode cuidar bem da sua criança/)).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")).toEqual({ method: "POST", path: "/api/pending-kinds/confirm", body: { kinds: ["email", "phone"] } });
    expect(screen.getByRole("button", { name: "Confirmar e compartilhar", hidden: true })).toBeDisabled();
  });

  it("409 PENDING_CHANGED: the new list is shown with a gentle note, and the next confirm sends the new kinds", async () => {
    let round = 0;
    const calls = stubApi({
      "GET /api/pending-kinds": () => Response.json(view(round === 0 ? ["phone"] : ["address", "phone"])),
      "POST /api/pending-kinds/confirm": () => {
        round++;
        return round === 1
          ? Response.json({ error: { code: "PENDING_CHANGED", reason: "pendingChanged", kinds: ["address", "phone"], message: "x" } }, { status: 409 })
          : Response.json({ ...view(["address", "phone"]), confirmed: 1 });
      },
    });
    ui();
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar e compartilhar" }));
    expect(await screen.findByText("O que pedimos mudou um pouquinho. Confira a lista de novo, por favor.")).toBeInTheDocument();
    expect(screen.getByText("Seu endereço")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar e compartilhar" }));
    await screen.findByText(/Obrigado!/);
    const posts = calls.filter((c) => c.method === "POST").map((c) => c.body);
    expect(posts).toEqual([{ kinds: ["phone"] }, { kinds: ["address", "phone"] }]);
  });

  it("'Agora não' just hides the step for this visit; nothing is sent", async () => {
    const calls = stubApi({ "GET /api/pending-kinds": () => Response.json(view(["phone"])) });
    ui();
    fireEvent.click(await screen.findByRole("button", { name: "Agora não" }));
    // it shrinks away (still mounted for the animation), out of reach
    await waitFor(() => expect(screen.queryByRole("button", { name: "Agora não" })).toBeNull());
    expect(screen.queryByRole("region", { name: TITLE })).toBeNull();
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("a failed confirm says so gently and keeps the step", async () => {
    stubApi({
      "GET /api/pending-kinds": () => Response.json(view(["phone"])),
      "POST /api/pending-kinds/confirm": () => Response.json({ error: { code: "INTERNAL", message: "x" } }, { status: 500 }),
    });
    ui();
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar e compartilhar" }));
    expect(await screen.findByText("Não foi possível confirmar agora. Tente de novo.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar e compartilhar" })).toBeEnabled();
  });
});
