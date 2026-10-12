import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import type { CampEvent, CampEventInput } from "../../api/schedule";
import EventForm from "./EventForm";

const venueApi = vi.hoisted(() => ({ getVenue: vi.fn() }));
vi.mock("../../api/places", () => venueApi);

/** WP-A5: the programme lives in schedule-api; the form picks the project roles present at the moment. */
const event: CampEvent = {
  id: "entry-1",
  date: "2026-10-16",
  title: "Piscina",
  emoji: "🏊",
  startTime: "14:00",
  endTime: "15:00",
  notes: "",
  roles: ["f1"],
  coreRoles: ["equipe", "futuro-perfil"],
  placeIds: [],
  visibleToParents: true,
  assignments: [],
  createdAt: "",
  updatedAt: "",
};

function ui(props: Partial<React.ComponentProps<typeof EventForm>> = {}) {
  const onSubmit = vi.fn(async (_: CampEventInput) => {});
  render(
    <I18nProvider>
      <EventForm token="t" busy={false} onSubmit={onSubmit} onCancel={() => {}} {...props} />
    </I18nProvider>,
  );
  return onSubmit;
}

describe("EventForm — who is at the moment", () => {
  beforeEach(() => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["pt-BR"]);
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
    venueApi.getVenue.mockReset().mockResolvedValue({ venue: null, places: [] });
  });

  it("a new moment starts with the team present and sends the picked project roles", async () => {
    const onSubmit = ui();
    const group = screen.getByRole("group", { name: "Quem está neste momento" });
    expect(group.querySelector("[aria-pressed=true]")).toHaveTextContent("Equipe");
    fireEvent.click(screen.getByRole("button", { name: /Fotografia/ }));
    fireEvent.change(screen.getByPlaceholderText("ex.: Piscina"), { target: { value: "Gincana" } });
    fireEvent.click(screen.getByRole("button", { name: /Criar evento/ }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ title: "Gincana", coreRoles: ["equipe", "fotografia"] });
  });

  it("an edit shows the saved roles, can drop one, and keeps a role this screen does not list", async () => {
    const onSubmit = ui({ event });
    expect(screen.getByRole("button", { name: "Equipe" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Equipe" }));
    expect(screen.getByRole("button", { name: "Equipe" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: /Salvar/ }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].coreRoles).toEqual(["futuro-perfil"]);
  });

  it("speaks the five languages (the roles and the hint)", () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["en-US"]);
    ui();
    expect(screen.getByRole("group", { name: "Who is at this moment" })).toBeInTheDocument();
  });
});

/** WP-A4: where the moment happens — places of the camp venue (places-api), sent as `placeIds`. */
describe("EventForm — where it happens", () => {
  beforeEach(() => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["pt-BR"]);
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
    venueApi.getVenue.mockReset().mockResolvedValue({
      venue: { id: "v1", name: "Retiro Exemplo", city: "Atibaia" },
      places: [
        { id: "p-hall", name: "Refeitório", kind: "meeting-room", parentId: "v1" },
        { id: "p-pool", name: "Quadra", kind: "sanctuary", parentId: "v1" },
        { id: "p-101", name: "101", kind: "bedroom", parentId: "v1", linked: true },
      ],
    });
  });

  it("lists the venue's places, sends the picked ones and can drop one on edit", async () => {
    const onSubmit = ui();
    const group = await screen.findByRole("group", { name: "Onde acontece (opcional)" });
    fireEvent.click(await screen.findByRole("button", { name: /Refeitório/ }));
    expect(group.querySelectorAll("[aria-pressed=true]")).toHaveLength(1);
    fireEvent.change(screen.getByPlaceholderText("ex.: Piscina"), { target: { value: "Café" } });
    fireEvent.click(screen.getByRole("button", { name: /Criar evento/ }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].placeIds).toEqual(["p-hall"]);
  });

  it("an edit shows the saved places, keeps one the venue no longer lists, and lets it be removed", async () => {
    const onSubmit = ui({ event: { ...event, placeIds: ["p-pool", "gone-1"], places: [{ id: "gone-1", name: "Antigo salão", kind: "meeting-room" }] } });
    expect(await screen.findByRole("button", { name: /Quadra/ })).toHaveAttribute("aria-pressed", "true");
    const gone = screen.getByRole("button", { name: /Antigo salão/ });
    fireEvent.click(gone);
    fireEvent.click(screen.getByRole("button", { name: /Salvar/ }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].placeIds).toEqual(["p-pool"]);
  });

  it("without a venue chosen there is no places field (the moment still saves)", async () => {
    venueApi.getVenue.mockResolvedValue({ venue: null, places: [] });
    const onSubmit = ui();
    await waitFor(() => expect(venueApi.getVenue).toHaveBeenCalled());
    expect(screen.queryByRole("group", { name: "Onde acontece (opcional)" })).toBeNull();
    fireEvent.change(screen.getByPlaceholderText("ex.: Piscina"), { target: { value: "Café" } });
    fireEvent.click(screen.getByRole("button", { name: /Criar evento/ }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].placeIds).toEqual([]);
  });
});
