import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import type { Bedroom, BedroomInput, BedroomLinkInput } from "../../api/bedrooms";
import type { VenuePlace } from "../../api/places";
import BedroomForm from "./BedroomForm";

/** WP-A4: a camp room is a link to a places-api bedroom — create a new one, or take one the venue already has. */

const room: Bedroom = {
  id: "r1",
  placeId: "place-1",
  name: "101",
  group: "girls",
  bunkBeds: 2,
  singleBeds: 1,
  doubleBeds: 0,
  capacity: 5,
  occupied: 0,
  occupiedStaff: 0,
  occupiedCampers: 0,
  available: 5,
  notes: "",
  createdAt: "",
  updatedAt: "",
};

const linkable: VenuePlace[] = [
  { id: "place-7", name: "201", kind: "bedroom", parentId: "venue", linked: false },
  { id: "place-8", name: "202", kind: "bedroom", parentId: "venue", linked: false },
];

function ui(props: Partial<React.ComponentProps<typeof BedroomForm>> = {}) {
  const onSubmit = vi.fn(async (_: BedroomInput) => {});
  const onLink = vi.fn(async (_: BedroomLinkInput) => {});
  render(
    <I18nProvider>
      <BedroomForm busy={false} onSubmit={onSubmit} onLink={onLink} onCancel={() => {}} {...props} />
    </I18nProvider>,
  );
  return { onSubmit, onLink };
}

describe("BedroomForm — rooms live in the church's places catalog", () => {
  beforeEach(() => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["pt-BR"]);
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  });

  it("creates a new room with its wing and beds", async () => {
    const { onSubmit } = ui();
    fireEvent.change(screen.getByPlaceholderText("ex.: 103"), { target: { value: "301" } });
    fireEvent.click(screen.getByRole("button", { name: /Meninos/ }));
    fireEvent.click(screen.getByRole("button", { name: /Criar quarto/ }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ name: "301", group: "boys", bunkBeds: 2, singleBeds: 0 });
  });

  it("offers no 'use a room of the venue' choice when the venue has none left", () => {
    ui();
    expect(screen.queryByRole("radiogroup", { name: "De onde vem o quarto?" })).toBeNull();
  });

  it("takes a room the venue already has: pick it, pick the wing — no new place is made", async () => {
    const { onSubmit, onLink } = ui({ linkable });
    fireEvent.click(screen.getByRole("radio", { name: /Usar um quarto do local/ }));
    expect(screen.queryByPlaceholderText("ex.: 103")).toBeNull();
    const submit = screen.getByRole("button", { name: /Criar quarto/ });
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: /202/ }));
    fireEvent.click(screen.getByRole("button", { name: /Equipe/ }));
    fireEvent.click(submit);
    await waitFor(() => expect(onLink).toHaveBeenCalled());
    expect(onLink.mock.calls[0][0]).toEqual({ placeId: "place-8", group: "staff", notes: "" });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("editing keeps the church's name and beds; a place that vanished from the catalog locks them", () => {
    ui({ bedroom: room });
    expect(screen.getByPlaceholderText("ex.: 103")).toBeEnabled();
    expect(screen.getByText(/ficam no cadastro de locais da igreja/)).toBeInTheDocument();
  });

  it("a room whose place is gone only lets the wing and notes change", () => {
    ui({ bedroom: { ...room, placeMissing: true } });
    expect(screen.getByPlaceholderText("ex.: 103")).toBeDisabled();
    expect(screen.getByText(/não existe mais no cadastro de locais da igreja/)).toBeInTheDocument();
  });

  it("speaks the five languages (the mode cards)", () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["de-DE"]);
    ui({ linkable });
    expect(screen.getByRole("radiogroup", { name: "Woher kommt das Zimmer?" })).toBeInTheDocument();
  });
});
