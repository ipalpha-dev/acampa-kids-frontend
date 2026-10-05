import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { draftProblems, insertVariable, smsCounter } from "../../api/templates";
import { ConfirmProvider } from "../../components/ConfirmDialog";
import { I18nProvider } from "../../i18n";
import MessageTemplatesPage from "./MessageTemplatesPage";

const body = (pt: string) => ({ "pt-BR": pt, "en-US": "Hi {name}", es: "Hola {name}", fr: "Salut {name}", de: "Hallo {name}" });

const SMS = {
  slug: "acampa-my-room",
  name: "Seu quarto",
  channel: "sms",
  variables: ["name", "room"],
  subject: null,
  body: body("Acampa Kids: {name}, seu quarto é {room}."),
  live: true,
  version: 2,
  customized: false,
  defaults: { body: body("Acampa Kids: {name}, seu quarto é {room}."), subject: null },
};
const EMAIL = { ...SMS, slug: "acampa-team-welcome-email", name: "Boas-vindas (e-mail)", channel: "email", subject: body("Bem-vindo, {name}"), live: false };

function stub(onPatch?: (body: unknown) => void) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), window.location.origin).pathname;
    const method = init?.method ?? "GET";
    if (method === "GET" && path === "/api/settings/message-templates") return Response.json({ templates: [SMS, EMAIL] });
    if (method === "PATCH" && path === "/api/settings/message-templates/acampa-my-room") {
      const b = JSON.parse(String(init?.body));
      onPatch?.(b);
      return Response.json({ template: { ...SMS, ...b, customized: true, version: 3 } });
    }
    return Response.json({ error: { code: "NOT_FOUND", message: "x" } }, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderPage() {
  return render(
    <I18nProvider>
      <ConfirmProvider>
        <MessageTemplatesPage token="tok" />
      </ConfirmProvider>
    </I18nProvider>,
  );
}

describe("template rules (decision 45)", () => {
  it("counts SMS characters against 160 (emoji = one character)", () => {
    expect(smsCounter("a".repeat(160))).toEqual({ length: 160, max: 160, left: 0, over: false });
    expect(smsCounter("a".repeat(161)).over).toBe(true);
    expect(smsCounter("🏕️ ok").length).toBe(5);
  });

  it("flags a missing pt-BR text, an SMS over 160 and unknown variables", () => {
    const problems = draftProblems({ channel: "sms", variables: ["name"], subject: null, body: { "pt-BR": "", "en-US": "x".repeat(161), es: "Hola {kid}" } });
    expect(problems).toEqual([
      { kind: "ptRequired" },
      { kind: "tooLong", lang: "en-US", length: 161 },
      { kind: "unknownVariable", lang: "es", names: ["kid"] },
    ]);
    expect(draftProblems({ channel: "email", variables: ["name"], subject: { "pt-BR": "{name}" }, body: { "pt-BR": "x".repeat(400) } })).toEqual([]);
  });

  it("inserts a variable at the caret", () => {
    expect(insertVariable("Olá !", "name", 4)).toEqual({ text: "Olá {name}!", caret: 10 });
  });
});

describe("Configurações → Mensagens", () => {
  beforeEach(() => vi.spyOn(navigator, "languages", "get").mockReturnValue(["pt-BR"]));
  afterEach(() => vi.unstubAllGlobals());

  it("lists the templates by channel, offers to create the missing ones and edits an SMS with the 160 counter", async () => {
    const patched: unknown[] = [];
    stub((b) => patched.push(b));
    renderPage();
    expect(await screen.findByRole("button", { name: /Seu quarto/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "SMS" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "E-mail" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar no IPAlpha" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Seu quarto/ }));
    const text = await screen.findByLabelText("Texto do SMS");
    expect(screen.getByText(`${SMS.body["pt-BR"].length} de 160 caracteres`)).toBeInTheDocument();
    const save = screen.getByRole("button", { name: "Salvar" });
    expect(save).toBeDisabled();

    // over 160: the counter warns and saving is blocked
    fireEvent.change(text, { target: { value: "x".repeat(170) } });
    expect(screen.getByText("170 de 160 caracteres")).toBeInTheDocument();
    expect(screen.getByText("Português: o SMS passou de 160 caracteres (170).")).toBeInTheDocument();
    expect(save).toBeDisabled();

    // a variable chip inserts {room}; within the limit it saves to IPAlpha
    fireEvent.change(text, { target: { value: "Oi {name}! Quarto: " } });
    fireEvent.click(screen.getByRole("button", { name: "{room}" }));
    expect((text as HTMLTextAreaElement).value).toContain("{room}");
    expect(save).not.toBeDisabled();
    fireEvent.click(save);
    await waitFor(() => expect(patched).toHaveLength(1));
    expect((patched[0] as { body: Record<string, string> }).body["pt-BR"]).toContain("{room}");
    expect(await screen.findByText(/Salvo no IPAlpha/)).toBeInTheDocument();
  });

  it("edits all five languages — each one named in itself", async () => {
    stub();
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Seu quarto/ }));
    const tabs = within(await screen.findByRole("tablist")).getAllByRole("tab").map((t) => t.textContent);
    expect(tabs).toEqual(["Português", "English", "Español", "Français", "Deutsch"]);
    fireEvent.click(screen.getByRole("tab", { name: "Deutsch" }));
    expect((screen.getByLabelText("Texto do SMS") as HTMLTextAreaElement).value).toBe("Hallo {name}");
  });
});
