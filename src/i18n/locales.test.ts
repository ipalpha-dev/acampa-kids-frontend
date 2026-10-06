import { afterEach, describe, expect, it, vi } from "vitest";
import { LITERALS } from "./literals";
import { LOCALE_TAG, LOCALES, deviceLocale, resolveLocale } from "./locales";
import { translate } from "./index";

function deviceLanguages(languages: string[]) {
  vi.spyOn(navigator, "languages", "get").mockReturnValue(languages);
  vi.spyOn(navigator, "language", "get").mockReturnValue(languages[0] ?? "");
}

describe("German (de) locale", () => {
  afterEach(() => vi.restoreAllMocks());

  it("is one of the five languages, tagged de-DE", () => {
    expect(LOCALES).toEqual(["pt", "en", "es", "fr", "de"]);
    expect(LOCALE_TAG.de).toBe("de-DE");
  });

  it("follows a German device (any region) and falls back to pt-BR otherwise", () => {
    deviceLanguages(["de-AT", "en-US"]);
    expect(deviceLocale()).toBe("de");
    deviceLanguages(["de_CH"]);
    expect(deviceLocale()).toBe("de");
    deviceLanguages(["it-IT"]);
    expect(deviceLocale()).toBe("pt");
    expect(resolveLocale("DE")).toBe("de");
  });

  it("translates named keys and the literal tables", () => {
    expect(translate("de", "login.ipalpha")).toBe("Mit IPAlpha anmelden");
    expect(translate("de", "maintenance.title")).toBe("Wir räumen gerade das Camp auf!");
    expect(LITERALS["Cancelar"]?.de).toBe("Abbrechen");
  });

  it("has a German string for every literal", () => {
    const missing = Object.entries(LITERALS).filter(([, row]) => !row.de?.trim()).map(([pt]) => pt);
    expect(missing).toEqual([]);
  });
});
