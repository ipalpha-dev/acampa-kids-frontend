import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { ConfirmProvider } from "./components/ConfirmDialog";
import { I18nProvider } from "./i18n";

const AUTH = "https://auth.example.test";

type Route = { status: number; body: unknown };

/** Stubs fetch by path; anything unlisted answers 404. */
function stubApi(routes: Record<string, Route>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input), window.location.origin).pathname;
    const route = routes[path] ?? { status: 404, body: { error: { code: "NOT_FOUND", message: "not found" } } };
    return new Response(JSON.stringify(route.body), { status: route.status, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const CONFIG_ON: Route = { status: 200, body: { enabled: true, authOrigin: AUTH, clientId: "acampa", entryPoint: "web" } };
const CONFIG_OFF: Route = { status: 200, body: { enabled: false } };
const UNAVAILABLE: Route = { status: 503, body: { error: { code: "IPALPHA_UNAVAILABLE", message: "core down" } } };

function renderApp() {
  return render(
    <I18nProvider>
      <ConfirmProvider>
        <App />
      </ConfirmProvider>
    </I18nProvider>,
  );
}

describe("login screen — IPAlpha", () => {
  beforeEach(() => {
    // the copy below is the pt-BR source; jsdom reports en-US by default
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["pt-BR"]);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hides 'Entrar com IPAlpha' and the One Tap banner when the backend has the feature off", async () => {
    const fetchMock = stubApi({ "/api/auth/ipalpha/config": CONFIG_OFF });
    const { container } = renderApp();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/auth/ipalpha/config"), expect.anything()));
    expect(screen.queryByRole("button", { name: /Entrar com IPAlpha/ })).toBeNull();
    expect(container.ownerDocument.querySelector("iframe")).toBeNull();
  });

  it("shows the button and the One Tap frame when enabled", async () => {
    stubApi({ "/api/auth/ipalpha/config": CONFIG_ON });
    renderApp();
    expect(await screen.findByRole("button", { name: /Entrar com IPAlpha/ })).toBeInTheDocument();
    expect(document.querySelector(`iframe[src^="${AUTH}/one-tap"]`)).not.toBeNull();
  });

  it("shows the maintenance scene when the SMS path answers IPALPHA_UNAVAILABLE", async () => {
    stubApi({ "/api/auth/ipalpha/config": CONFIG_OFF, "/api/auth/otp/request": UNAVAILABLE });
    renderApp();
    fireEvent.change(screen.getByPlaceholderText("(11) 98123-4567"), { target: { value: "11981234567" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByRole("heading", { name: "Estamos arrumando o acampamento!" })).toBeInTheDocument();
    expect(screen.getByText("Volte daqui a pouquinho.")).toBeInTheDocument();

    // "Tentar de novo" brings the phone step back
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByRole("heading", { name: "Qual é o seu celular?" })).toBeInTheDocument();
  });

  it("shows the maintenance scene when the IPAlpha path answers IPALPHA_UNAVAILABLE", async () => {
    stubApi({ "/api/auth/ipalpha/config": CONFIG_ON, "/api/auth/ipalpha/start": UNAVAILABLE });
    const popup = { closed: false, close: vi.fn(), focus: vi.fn(), location: { href: "about:blank" } };
    const open = vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
    renderApp();
    fireEvent.click(await screen.findByRole("button", { name: /Entrar com IPAlpha/ }));
    expect(open).toHaveBeenCalledWith("about:blank", "ipalpha-auth", expect.stringContaining("popup=yes,width=480,height=720"));
    expect(await screen.findByRole("heading", { name: "Estamos arrumando o acampamento!" })).toBeInTheDocument();
    expect(popup.close).toHaveBeenCalled();
    expect(popup.location.href).toBe("about:blank");
  });

  const inlineCases: [string, Route, RegExp][] = [
    ["IPALPHA_MISCONFIGURED", { status: 500, body: { error: { code: "IPALPHA_MISCONFIGURED", message: "x" } } }, /O login com IPAlpha não está disponível agora/],
    ["IPALPHA_RATE_LIMITED", { status: 429, body: { error: { code: "IPALPHA_RATE_LIMITED", message: "x", secondsLeft: 30 } } }, /Muitas tentativas em pouco tempo/],
  ];
  for (const [code, route, text] of inlineCases) {
    it(`${code} on start: a gentle note under the button, no maintenance scene, the SMS form stays usable`, async () => {
      stubApi({ "/api/auth/ipalpha/config": CONFIG_ON, "/api/auth/ipalpha/start": route });
      const popup = { closed: false, close: vi.fn(), focus: vi.fn(), location: { href: "about:blank" } };
      vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
      renderApp();
      fireEvent.click(await screen.findByRole("button", { name: /Entrar com IPAlpha/ }));
      expect(await screen.findByText(text)).toBeInTheDocument();
      expect(popup.close).toHaveBeenCalled();
      expect(screen.queryByRole("heading", { name: "Estamos arrumando o acampamento!" })).toBeNull();
      expect(screen.getByRole("heading", { name: "Qual é o seu celular?" })).toBeInTheDocument();
      const phone = screen.getByPlaceholderText("(11) 98123-4567");
      expect(phone).not.toBeDisabled();
      fireEvent.change(phone, { target: { value: "11981234567" } });
      expect(screen.getByRole("button", { name: "Continuar" })).not.toBeDisabled();
      expect(screen.getByRole("button", { name: /Entrar com IPAlpha/ })).not.toBeDisabled();
    });
  }

  it("tells the person when the browser blocked the popup", async () => {
    stubApi({ "/api/auth/ipalpha/config": CONFIG_ON });
    vi.spyOn(window, "open").mockReturnValue(null);
    renderApp();
    fireEvent.click(await screen.findByRole("button", { name: /Entrar com IPAlpha/ }));
    expect(await screen.findByText(/bloqueou a janela do IPAlpha/)).toBeInTheDocument();
  });
});
