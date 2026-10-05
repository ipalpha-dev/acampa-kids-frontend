import { afterEach, describe, expect, it } from "vitest";
import { currentCampLabel, guardianGreeting, staffGreeting } from "./whatsapp";

describe("WhatsApp greetings name the current camp", () => {
  afterEach(() => localStorage.clear());

  it("uses the session's camp label — never a hardcoded year", () => {
    localStorage.setItem("acampa.auth", JSON.stringify({ token: "tok", tokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(), user: { id: "me", personId: "me", name: "Flavi", roles: ["equipe"], activeRole: "equipe", audience: "staff", superAdmin: false }, camp: { id: "c1", label: "Acampa Kids 2027", year: 2027, active: true }, camps: [] }));
    expect(staffGreeting({ toName: "Cesar Lima", fromName: "Flavi Souza" })).toBe("Olá, Cesar! Aqui é Flavi, do Acampa Kids 2027.");
    expect(guardianGreeting({ guardianName: "Marcela", staffName: "Cesar", camperName: "Ana" })).toContain("aqui no Acampa Kids 2027.");
  });

  it("falls back to the camp's year, then to the plain name", () => {
    expect(currentCampLabel({ label: " ", year: 2028 })).toBe("Acampa Kids 2028");
    expect(currentCampLabel(null)).toBe("Acampa Kids");
    expect(staffGreeting({ toName: "", fromName: "", campLabel: "Acampa Kids 2029" })).toBe("Olá! Aqui é do Acampa Kids 2029.");
  });
});
