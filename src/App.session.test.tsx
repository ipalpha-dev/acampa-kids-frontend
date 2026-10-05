import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { ConfirmProvider } from "./components/ConfirmDialog";
import { I18nProvider } from "./i18n";
import type { LoggedUser } from "./roles";

type Route = { status: number; body: unknown } | ((init?: RequestInit) => { status: number; body: unknown });

/** Stubs fetch by `METHOD path`; anything unlisted answers 404. */
function stubApi(routes: Record<string, Route>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), window.location.origin).pathname;
    const method = (init?.method ?? "GET").toUpperCase();
    const hit = routes[`${method} ${path}`];
    const route = typeof hit === "function" ? hit(init) : (hit ?? { status: 404, body: { error: { code: "NOT_FOUND", message: "not found" } } });
    return new Response(JSON.stringify(route.body), { status: route.status, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** A silent WebSocket: the realtime feed never connects in these tests. */
class FakeSocket {
  static OPEN = 1;
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: ((e: { code: number; reason: string }) => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  send() {}
  close() {}
}

const CAMP = { id: "camp-1", label: "Acampa Kids", year: 2026, active: true };
const KEY = btoa(String.fromCharCode(...new Array(32).fill(9)));

function user(over: Partial<LoggedUser> = {}): LoggedUser {
  return { id: "p-1", personId: "p-1", name: "Marta Lima", roles: ["equipe"], activeRole: "equipe", audience: "staff", superAdmin: false, ...over };
}

function loginAnswer(u: LoggedUser) {
  return { status: 200, body: { success: true, token: "sess-1", tokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(), sessionIdleHours: 96, user: u, camp: CAMP } };
}

const COMMON: Record<string, Route> = {
  "GET /api/auth/ipalpha/config": { status: 200, body: { enabled: false } },
  "GET /api/camps/active": { status: 200, body: { camp: CAMP } },
  "GET /api/auth/offline-key": { status: 200, body: { key: KEY, alg: "AES-GCM", role: "equipe", healthAllowed: false, sessionExpiresAt: new Date(Date.now() + 3600_000).toISOString(), campEndsAt: null } },
};

function renderApp() {
  return render(
    <I18nProvider>
      <ConfirmProvider>
        <App />
      </ConfirmProvider>
    </I18nProvider>,
  );
}

async function signInBySms(code = "123456") {
  fireEvent.change(screen.getByPlaceholderText("(11) 98123-4567"), { target: { value: "11981234567" } });
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
  await screen.findByText(/Enviamos um SMS para \(11\) •••••-4567/);
  const boxes = screen.getAllByRole("textbox");
  fireEvent.paste(boxes[0], { clipboardData: { getData: () => code } });
}

describe("session — roles, NOT_IN_PROJECT, 401", () => {
  beforeEach(() => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["pt-BR"]);
    vi.stubGlobal("WebSocket", FakeSocket);
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
    window.location.hash = "";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("SMS login sends the sealed challenge back with the code (no phone) and keeps only a masked phone", async () => {
    const fetchMock = stubApi({
      ...COMMON,
      "POST /api/auth/otp/request": { status: 200, body: { success: true, challenge: "sealed-abc", codeLength: 6, expiresAt: new Date(Date.now() + 300_000).toISOString(), expireMinutes: 5, delivery: "sms" } },
      "POST /api/auth/otp/verify": (init) => {
        expect(JSON.parse(String(init?.body))).toEqual({ challenge: "sealed-abc", code: "123456" });
        return loginAnswer(user());
      },
    });
    renderApp();
    await signInBySms();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/auth/otp/verify"), expect.anything()));
    expect(localStorage.getItem("acampa.otp")).toBeNull();
    const saved = JSON.parse(localStorage.getItem("acampa.auth") ?? "{}");
    expect(saved.user.personId).toBe("p-1");
    expect(JSON.stringify(saved)).not.toContain("981234567");
  });

  it("NOT_IN_PROJECT on the phone step shows the gentle note and keeps the form", async () => {
    stubApi({ ...COMMON, "POST /api/auth/otp/request": { status: 404, body: { error: { code: "NOT_IN_PROJECT", message: "x" } } } });
    renderApp();
    fireEvent.change(screen.getByPlaceholderText("(11) 98123-4567"), { target: { value: "11981234567" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Não encontramos seu cadastro neste acampamento — fale com a organização.");
    expect(screen.getByRole("heading", { name: "Qual é o seu celular?" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuar" })).not.toBeDisabled();
  });

  it("NOT_IN_PROJECT after the code (no role in the project) returns to the phone step with the note", async () => {
    stubApi({
      ...COMMON,
      "POST /api/auth/otp/request": { status: 200, body: { success: true, challenge: "c1", codeLength: 6, expiresAt: new Date(Date.now() + 300_000).toISOString(), expireMinutes: 5, delivery: "sms" } },
      "POST /api/auth/otp/verify": { status: 403, body: { error: { code: "NOT_IN_PROJECT", message: "x" } } },
    });
    renderApp();
    await signInBySms();
    expect(await screen.findByText("Não encontramos seu cadastro neste acampamento — fale com a organização.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Qual é o seu celular?" })).toBeInTheDocument();
    expect(localStorage.getItem("acampa.auth")).toBeNull();
  });

  it("the role chooser lists every session role with its gentle label and switches with the SAME token", async () => {
    const u = user({ roles: ["responsavel", "saude", "coordenacao", "checkin-onibus"], activeRole: "coordenacao", audience: "admin" });
    const fetchMock = stubApi({
      ...COMMON,
      "POST /api/auth/otp/request": { status: 200, body: { success: true, challenge: "c1", codeLength: 6, expiresAt: new Date(Date.now() + 300_000).toISOString(), expireMinutes: 5, delivery: "sms" } },
      "POST /api/auth/otp/verify": loginAnswer(u),
      "POST /api/auth/role": (init) => {
        expect(JSON.parse(String(init?.body))).toEqual({ role: "saude" });
        expect((init?.headers as Record<string, string>).authorization).toBe("Bearer sess-1");
        return { status: 200, body: { success: true, tokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(), user: { ...u, activeRole: "saude", audience: "staff" }, camp: CAMP } };
      },
    });
    renderApp();
    await signInBySms();
    const dialog = await screen.findByRole("dialog");
    const options = Array.from(dialog.querySelectorAll(".role-switch__option-label")).map((n) => n.textContent);
    // most capable first, gentle labels — never a rank
    expect(options).toEqual(["Coordenação", "Equipe de cuidado", "Check-in do ônibus", "Responsável"]);
    fireEvent.click(screen.getByRole("button", { name: /Equipe de cuidado/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/auth/role"), expect.anything()));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const saved = JSON.parse(localStorage.getItem("acampa.auth") ?? "{}");
    expect(saved.token).toBe("sess-1");
    expect(saved.user.activeRole).toBe("saude");
  });

  it("a role that is gone in core (ROLE_FORBIDDEN) leaves the list with a gentle message", async () => {
    const u = user({ roles: ["equipe", "fotografia"], activeRole: "equipe" });
    stubApi({
      ...COMMON,
      "POST /api/auth/otp/request": { status: 200, body: { success: true, challenge: "c1", codeLength: 6, expiresAt: new Date(Date.now() + 300_000).toISOString(), expireMinutes: 5, delivery: "sms" } },
      "POST /api/auth/otp/verify": loginAnswer(u),
      "POST /api/auth/role": { status: 403, body: { error: { code: "ROLE_FORBIDDEN", message: "x" } } },
    });
    renderApp();
    await signInBySms();
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: /Fotografia/ }));
    expect(await screen.findByText("Este perfil não está mais disponível para você.")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("acampa.auth") ?? "{}").user.roles).toEqual(["equipe"]);
  });

  it("a 401 SESSION_ENDED anywhere returns to the login gracefully and wipes the session", async () => {
    localStorage.setItem("acampa.auth", JSON.stringify({ token: "sess-old", tokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(), user: user(), camp: CAMP, camps: [] }));
    stubApi({ ...COMMON, "GET /api/auth/me": { status: 401, body: { error: { code: "SESSION_ENDED", message: "Sua sessão terminou." } } } });
    await act(async () => {
      renderApp();
    });
    expect(await screen.findByText("Sua sessão terminou. É só entrar de novo quando quiser. 🌲")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Qual é o seu celular?" })).toBeInTheDocument();
    expect(localStorage.getItem("acampa.auth")).toBeNull();
  });

  it("a session saved by the old phone-based app (no personId) is dropped: sign in again", async () => {
    localStorage.setItem("acampa.auth", JSON.stringify({ token: "legacy", tokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(), user: { id: "u1", name: "X", phone: "+5511981234567", roles: ["staff"], activeRole: "staff" }, camp: CAMP }));
    stubApi(COMMON);
    renderApp();
    expect(await screen.findByRole("heading", { name: "Qual é o seu celular?" })).toBeInTheDocument();
    expect(localStorage.getItem("acampa.auth")).toBeNull();
  });
});
