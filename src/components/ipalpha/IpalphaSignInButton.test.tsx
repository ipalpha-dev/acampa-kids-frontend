import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider, translate } from "../../i18n";
import IpalphaSignInButton from "./IpalphaSignInButton";

const view = (busy: boolean) =>
  render(
    <I18nProvider>
      <IpalphaSignInButton busy={busy} error={null} notice={null} onStart={() => {}} />
    </I18nProvider>,
  );

describe("IpalphaSignInButton", () => {
  beforeEach(() => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["pt-BR"]);
    vi.spyOn(navigator, "language", "get").mockReturnValue("pt-BR");
  });

  it("shows the label and the white IPAlpha wordmark", () => {
    view(false);
    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("Entrar com");
    const mark = screen.getByAltText("IPAlpha");
    expect(mark).toHaveAttribute("src", "/logo-mark-dark.png");
    expect(button).not.toHaveAttribute("aria-busy");
  });

  it("is busy and disabled while signing in", () => {
    view(true);
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toBeDisabled();
  });

  it("has the hint and button label in every language", () => {
    for (const l of ["pt", "en", "es", "fr", "de"] as const) {
      expect(translate(l, "login.otpHint").length).toBeGreaterThan(10);
      expect(translate(l, "login.ipalphaWith").length).toBeGreaterThan(3);
    }
    expect(translate("en", "login.otpHint")).toMatch(/Check the number/);
  });
});
