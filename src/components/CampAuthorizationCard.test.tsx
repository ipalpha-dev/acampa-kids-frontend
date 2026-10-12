import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import CampAuthorizationCard from "./CampAuthorizationCard";
import { LITERALS as CONSENTS } from "../i18n/pending/consents";

/** Decision 13: the camp authorization on the family's screen — the exact text, one acceptance per child, never a revoke. */
const DOC = "camp-authorization";
const v = (version: number, markdown: string) => ({ document: DOC, version, title: { "pt-BR": "Autorização do acampamento 2026", "en-US": "Camp authorization 2026" }, markdown });
const answer = (version: number, markdown: string, pendingFor: string[], all = ["kid-a", "kid-b"]) => ({
  editionId: "ed-1",
  documents: pendingFor.length ? [v(version, markdown)] : [],
  children: all.map((personId) => ({ personId, pending: pendingFor.includes(personId) ? [{ document: DOC, version }] : [] })),
});

type Call = { method: string; path: string; body: unknown };

function stubApi(handler: (method: string, path: string, body: unknown) => Response) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), window.location.origin);
      const method = (init?.method ?? "GET").toUpperCase();
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ method, path: url.pathname, body });
      return handler(method, url.pathname, body);
    }),
  );
  return calls;
}

let n = 0;
const KIDS = [{ id: "kid-a", name: "Ana Clara Souza" }, { id: "kid-b", name: "Bruno Lima" }];
const ui = () => render(<I18nProvider><CampAuthorizationCard token={`tok-${++n}`} kids={KIDS} /></I18nProvider>);

describe("camp authorization (decision 13)", () => {
  beforeEach(() => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["pt-BR"]);
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows the exact document text (formatted, never as HTML) and one gentle button per child", async () => {
    stubApi(() => Response.json(answer(2, "# Cuidado\n\nAutorizo a **participação**.\n\n- Fotos\n- Passeios\n\n<img src=x onerror=alert(1)>", ["kid-a", "kid-b"])));
    const { container } = ui();
    expect(await screen.findByRole("heading", { name: "Autorização do acampamento 2026" })).toBeInTheDocument();
    const text = screen.getByRole("document", { name: "Texto da autorização" });
    expect(within(text).getByRole("heading", { name: "Cuidado" })).toBeInTheDocument();
    expect(within(text).getByText("participação").tagName).toBe("STRONG");
    expect(within(text).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Fotos", "Passeios"]);
    // raw HTML in the source is shown as text: no element is created from it
    expect(container.querySelector("img")).toBeNull();
    expect(text).toHaveTextContent("<img src=x onerror=alert(1)>");
    expect(screen.getByRole("button", { name: "Li e autorizo a participação de Ana" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Li e autorizo a participação de Bruno" })).toBeInTheDocument();
    expect(screen.getAllByText("Aguardando sua autorização")).toHaveLength(2);
    expect(screen.getByText("Você pode conversar com a coordenação se tiver dúvidas.")).toBeInTheDocument();
  });

  it("accepting records the exact version shown, for that child only, then shows it as accepted", async () => {
    let accepted = false;
    const calls = stubApi((method, path) => {
      if (method === "POST" && path === "/api/consents/accept") {
        accepted = true;
        return Response.json({ accepted: { personId: "kid-a", document: DOC, version: 2 } });
      }
      return Response.json(answer(2, "Texto v2", accepted ? ["kid-b"] : ["kid-a", "kid-b"]));
    });
    ui();
    fireEvent.click(await screen.findByRole("button", { name: "Li e autorizo a participação de Ana" }));
    await waitFor(() => expect(screen.getByText("Autorização aceita")).toBeInTheDocument());
    expect(calls.filter((c) => c.method === "POST")).toEqual([{ method: "POST", path: "/api/consents/accept", body: { personId: "kid-a", document: DOC, version: 2 } }]);
    expect(screen.getByRole("status")).toHaveTextContent("A autorização de Ana está registrada");
    expect(screen.queryByRole("button", { name: /de Ana/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Li e autorizo a participação de Bruno" })).toBeInTheDocument();
  });

  it("a new version published meanwhile: the new text is shown and the family is asked again (nothing recorded for the old one)", async () => {
    let version = 2;
    const calls = stubApi((method, path) => {
      if (method === "POST" && path === "/api/consents/accept") {
        version = 3;
        return Response.json({ error: { code: "CONSENT_VERSION_CHANGED", message: "O texto da autorização foi atualizado. Leia a nova versão, por favor.", currentVersion: 3 } }, { status: 409 });
      }
      return Response.json(answer(version, version === 2 ? "Texto antigo" : "Texto novo da versão 3", ["kid-a"]));
    });
    ui();
    expect(await screen.findByText("Texto antigo")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Li e autorizo a participação de Ana" }));
    expect(await screen.findByText("Texto novo da versão 3")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Leia a nova versão");
    // the next acceptance carries the version now shown
    stubApi((method) => (method === "POST" ? Response.json({ accepted: { personId: "kid-a", document: DOC, version: 3 } }) : Response.json(answer(3, "Texto novo da versão 3", []))));
    fireEvent.click(screen.getByRole("button", { name: "Li e autorizo a participação de Ana" }));
    await waitFor(() => expect(screen.getByText("Autorização aceita")).toBeInTheDocument());
    expect(calls.filter((c) => c.method === "POST")[0].body).toEqual({ personId: "kid-a", document: DOC, version: 2 });
  });

  it("there is no way to withdraw or decline here — only 'agora não' and the coordenação to talk to", async () => {
    stubApi(() => Response.json(answer(2, "Texto", ["kid-a"])));
    ui();
    await screen.findByRole("button", { name: /Li e autorizo/ });
    const names = screen.getAllByRole("button").map((b) => b.textContent ?? "");
    expect(names.some((t) => /revog|retirar|cancelar|não autorizo|recusar/i.test(t))).toBe(false);
    expect(names).toEqual(["Li e autorizo a participação de Ana", "Agora não"]);
  });

  it("nothing pending: the step stays away (inert)", async () => {
    const calls = stubApi(() => Response.json(answer(2, "Texto", [])));
    const { container } = ui();
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(screen.queryByRole("heading", { name: "Autorização do acampamento" })).toBeNull();
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  it("speaks the five languages (the document title follows; the text stays as published)", async () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["en-US"]);
    stubApi(() => Response.json(answer(2, "Texto", ["kid-a"])));
    ui();
    expect(await screen.findByRole("heading", { name: "Camp authorization 2026" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "I have read it and authorize Ana to take part" })).toBeInTheDocument();
    expect(screen.getByText("The authorization text is in Portuguese, as the church published it.")).toBeInTheDocument();
    for (const [pt, row] of Object.entries(CONSENTS)) {
      for (const locale of ["en", "es", "fr", "de"] as const) expect({ pt, locale, ok: !!row[locale] }).toEqual({ pt, locale, ok: true });
      const names = (pt.match(/\{\w+\}/g) ?? []).sort();
      for (const locale of ["en", "es", "fr", "de"] as const) expect((row[locale]!.match(/\{\w+\}/g) ?? []).sort()).toEqual(names);
    }
  });
});
