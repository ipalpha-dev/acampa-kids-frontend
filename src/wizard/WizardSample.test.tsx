import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { IntroStep } from "./WizardPage";

function stubSample(enabled: boolean | "error") {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input), window.location.origin).pathname;
    if (path === "/api/wizard/sample") {
      if (enabled === "error") return Response.json({ error: { code: "NOT_FOUND", message: "x" } }, { status: 404 });
      return Response.json({ enabled });
    }
    return Response.json({ error: { code: "NOT_FOUND", message: "x" } }, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderIntro() {
  return render(
    <I18nProvider>
      <IntroStep token="tok" onNext={() => {}} onSkip={() => {}} />
    </I18nProvider>,
  );
}

describe("wizard sample (decision 71: previews / dev only)", () => {
  beforeEach(() => vi.spyOn(navigator, "languages", "get").mockReturnValue(["pt-BR"]));
  afterEach(() => vi.unstubAllGlobals());

  it("shows 'Ver funcionando' only when GET /api/wizard/sample answers enabled", async () => {
    stubSample(true);
    renderIntro();
    expect(await screen.findByRole("button", { name: /Ver funcionando/ })).toBeInTheDocument();
  });

  it("hides it when disabled (production) or when the check fails", async () => {
    const fetchMock = stubSample(false);
    const view = renderIntro();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /Ver funcionando/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Montar do zero/ })).toBeInTheDocument();
    view.unmount();

    const failing = stubSample("error");
    renderIntro();
    await waitFor(() => expect(failing).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /Ver funcionando/ })).toBeNull();
  });
});
