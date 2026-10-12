import { describe, expect, it } from "vitest";
import { LITERALS as PLACES } from "./pending/places";

describe("places copy — the camp venue, rooms and programme places", () => {
  it("every text exists in the four other languages (no empty, no copy of the Portuguese)", () => {
    for (const [pt, row] of Object.entries(PLACES)) {
      for (const locale of ["en", "es", "fr", "de"] as const) {
        expect({ pt, locale, ok: !!row[locale] && row[locale]!.length > 0 }).toEqual({ pt, locale, ok: true });
      }
      expect(row.en).not.toBe(pt);
    }
  });

  it("keeps the {placeholders} of the source in every language", () => {
    for (const [pt, row] of Object.entries(PLACES)) {
      const names = (pt.match(/\{\w+\}/g) ?? []).sort();
      for (const locale of ["en", "es", "fr", "de"] as const) expect({ pt, locale, names: (row[locale]!.match(/\{\w+\}/g) ?? []).sort() }).toEqual({ pt, locale, names });
    }
  });
});
