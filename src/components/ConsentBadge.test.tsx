import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveAuth } from "../auth/store";
import { resetConsentStatus } from "../hooks/useConsentStatus";
import { I18nProvider } from "../i18n";
import ConsentBadge from "./ConsentBadge";

/** The team's badge per child: live, ids only, nothing when the role may not see it. */
function stub(body: unknown) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      calls.push(new URL(String(input), window.location.origin).pathname);
      return Response.json(body);
    }),
  );
  return calls;
}

const ui = (ids: string[]) =>
  render(
    <I18nProvider>
      {ids.map((id) => (
        <p key={id} data-testid={id}>
          <ConsentBadge personId={id} />
        </p>
      ))}
    </I18nProvider>,
  );

describe("ConsentBadge", () => {
  beforeEach(() => {
    resetConsentStatus();
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["pt-BR"]);
    saveAuth({ token: "tok", tokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(), user: { id: "me", personId: "me", name: "Eu", roles: ["saude"], activeRole: "saude", audience: "staff", superAdmin: false }, camp: { id: "c1", label: "Acampa", year: 2026, active: true }, camps: [] });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("accepted / pending per child, one read for the whole list; a child with nothing required shows nothing", async () => {
    const calls = stub({ visible: true, items: [{ personId: "a", accepted: true }, { personId: "b", accepted: false }] });
    ui(["a", "b", "c"]);
    expect(await screen.findByText("Autorização aceita")).toBeInTheDocument();
    expect(screen.getByTestId("b")).toHaveTextContent("Autorização pendente");
    expect(screen.getByTestId("c")).toBeEmptyDOMElement();
    expect(calls).toEqual(["/api/consents/status"]);
  });

  it("the role may not see it: no badge at all", async () => {
    const calls = stub({ visible: false, items: [] });
    ui(["a"]);
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(screen.getByTestId("a")).toBeEmptyDOMElement();
  });

  it("speaks the five languages", async () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["de-DE"]);
    stub({ visible: true, items: [{ personId: "a", accepted: false }] });
    ui(["a"]);
    expect(await screen.findByText("Einverständnis ausstehend")).toBeInTheDocument();
  });
});
