import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmProvider } from "../../components/ConfirmDialog";
import { I18nProvider } from "../../i18n";
import { applyServerData, clearStore } from "../../store";
import { rememberPeople } from "../../store/people";
import CampersPage from "./CampersPage";

const CAMP = { id: "c1", label: "Acampa", year: 2026, active: true };
const PEANUT = "opt-peanut";
const HEALTH = { allergies: [PEANUT], drugAllergies: [], healthIssues: [], neurodivergent: false, medications: [], foodRestrictions: "", healthNotes: "", weightKg: null, insurance: "", insuranceCard: "" };

function record(id: string) {
  return { id, personId: id, invitedBy: "", caretakerId: null, qrToken: "", team: null, transportation: null, bed: null, bedroom: null, generalNotes: "", bedroomPreference: "", checkin: null, busCheckin: null, busReturnCheckin: null, createdAt: "", parentEditedAt: null, importId: null, aiReviewStatus: null, aiReviewError: "", aiReviewStartedAt: null, aiReviewFinishedAt: null, updatedAt: "" };
}

/** 8 kids; "Ana Paz" and "Ana Rios" have health info. */
const KIDS = ["Ana Paz", "Ana Rios", "Bruno Lima", "Caio Reis", "Davi Sá", "Eva Luz", "Fábio Mar", "Gil Sol"].map((name, i) => ({ id: `k${i}`, name, hasHealth: i < 2 }));

function signIn(activeRole: string, audience: "admin" | "staff") {
  localStorage.setItem("acampa.auth", JSON.stringify({ token: "tok", tokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(), user: { id: "me", personId: "me", name: "Eu", roles: [activeRole], activeRole, audience, superAdmin: false }, camp: CAMP, camps: [] }));
}

function stubApi() {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), window.location.origin);
    calls.push(url.pathname + url.search);
    if (url.pathname === "/api/people/health-lists") return Response.json({ lists: [{ key: "alergias", options: [{ id: PEANUT, label: { "pt-BR": "Amendoim" }, order: 1, active: true }] }] });
    if (url.pathname === "/api/campers/health-counts") return Response.json({ total: 8, byTag: { [`allergies:${PEANUT}`]: 2, medications: 0 } });
    if (url.pathname === "/api/campers") {
      const q = url.searchParams.get("q");
      const tag = url.searchParams.get("tag");
      const pick = tag ? KIDS.slice(0, 2) : q ? KIDS.filter((k) => k.name.toLowerCase().includes(q.toLowerCase())) : KIDS;
      // the server only includes health with a tag, or a name filter with ≤ 6 matches
      const withHealth = !!tag || (!!q && pick.length <= 6);
      return Response.json({ items: pick.map((k) => ({ ...record(k.id), name: k.name, nickname: null, sex: null, hasHealth: k.hasHealth, ...(withHealth && k.hasHealth ? { health: HEALTH } : {}) })), nextCursor: null, total: pick.length });
    }
    return Response.json({ error: { code: "NOT_FOUND", message: "x" } }, { status: 404 });
  }));
  return calls;
}

function renderPage() {
  return render(
    <I18nProvider>
      <ConfirmProvider>
        <CampersPage token="tok" camp={CAMP} camps={[CAMP]} />
      </ConfirmProvider>
    </I18nProvider>,
  );
}

describe("Acampantes — health in lists (decision 31)", () => {
  beforeEach(() => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["pt-BR"]);
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
    window.location.hash = "#/campers";
    act(() => {
      applyServerData({ campers: KIDS.map((k) => record(k.id)) as never, bedrooms: [], staff: [], categories: [], teams: [], transports: [] }, new Date().toISOString());
      rememberPeople(KIDS.map((k) => ({ personId: k.id, name: k.name, nickname: null, sex: null, hasHealth: k.hasHealth })));
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    act(() => clearStore());
  });

  it("shows only a neutral ♥ — never what — and offers health chips with anonymized counts", async () => {
    signIn("coordenacao", "admin");
    stubApi();
    renderPage();
    expect(await screen.findByText("Bruno Lima")).toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: "Tem informações de saúde" })).toHaveLength(2);
    const rowsText = () => Array.from(document.querySelectorAll(".staff-card")).map((n) => n.textContent ?? "").join(" ");
    expect(rowsText()).not.toContain("Amendoim");
    const chip = await screen.findByRole("button", { name: /Amendoim\s*2/ });
    // a tag with nobody is not offered
    expect(screen.queryByRole("button", { name: /Medicação\s*0/ })).toBeNull();

    // picking the tag asks the server for that list — the only list with details
    fireEvent.click(chip);
    await waitFor(() => expect(screen.queryByText("Bruno Lima")).toBeNull());
    await waitFor(() => expect(rowsText()).toContain("Amendoim"));
  });

  it("a name filter narrowed to ≤ 6 kids shows their health; a wider one does not", async () => {
    signIn("coordenacao", "admin");
    const calls = stubApi();
    renderPage();
    await screen.findByText("Bruno Lima");
    const search = screen.getByRole("searchbox", { name: "Buscar" });

    const rowsText = () => Array.from(document.querySelectorAll(".staff-card")).map((n) => n.textContent ?? "").join(" ");
    // "a" matches all 8 kids (> 6) → no detail request, only ♥
    fireEvent.change(search, { target: { value: "a" } });
    await new Promise((r) => setTimeout(r, 500));
    expect(calls.some((c) => c.includes("q="))).toBe(false);
    expect(rowsText()).not.toContain("Amendoim");
    // "ana" → 2 kids → the server is asked with q and answers their health
    fireEvent.change(search, { target: { value: "Ana" } });
    await waitFor(() => expect(calls.some((c) => c.startsWith("/api/campers?") && c.includes("q=Ana"))).toBe(true));
    await waitFor(() => expect(rowsText()).toContain("Amendoim"));
  });

  it("a role without health access gets no ♥ and no health filter", async () => {
    signIn("equipe", "staff");
    act(() => rememberPeople(KIDS.map((k) => ({ personId: k.id, name: k.name, nickname: null, sex: null }))));
    const calls = stubApi();
    renderPage();
    expect(await screen.findByText("Bruno Lima")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Filtrar por saúde" })).toBeNull();
    expect(calls.some((c) => c.includes("health-counts"))).toBe(false);
  });
});
