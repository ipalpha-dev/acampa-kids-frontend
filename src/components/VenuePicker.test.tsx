import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { ApiError } from "../api/client";
import VenuePicker from "./VenuePicker";

const places = vi.hoisted(() => ({
  listVenues: vi.fn(),
  setCampVenue: vi.fn(),
  createVenue: vi.fn(),
}));
vi.mock("../api/places", () => places);

function ui(onChosen = vi.fn()) {
  render(
    <I18nProvider>
      <VenuePicker token="t" campId="camp-1" onChosen={onChosen} />
    </I18nProvider>,
  );
  return onChosen;
}

describe("VenuePicker — the camp venue comes from the church's places catalog", () => {
  beforeEach(() => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["pt-BR"]);
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
    places.listVenues.mockReset().mockResolvedValue({ venues: [{ id: "v1", name: "Retiro Exemplo", city: "Atibaia" }, { id: "v2", name: "Sítio Outro", city: null }], selectedId: null });
    places.setCampVenue.mockReset().mockResolvedValue(undefined);
    places.createVenue.mockReset();
  });

  it("lists the venues as cards and saves the picked one for the camp", async () => {
    const onChosen = ui();
    const card = await screen.findByRole("radio", { name: /Retiro Exemplo/ });
    expect(card).toHaveTextContent("Atibaia");
    fireEvent.click(card);
    await waitFor(() => expect(onChosen).toHaveBeenCalledWith({ id: "v1", name: "Retiro Exemplo", city: "Atibaia" }));
    expect(places.setCampVenue).toHaveBeenCalledWith("t", "camp-1", "v1");
  });

  it("each venue is an option card with the generated venue icon (icon + title, the city as the subtitle)", async () => {
    ui();
    const card = await screen.findByRole("radio", { name: /Retiro Exemplo/ });
    expect(card).toHaveClass("option-card");
    expect(card.querySelector("img")).toHaveAttribute("src", "/icons/venue.png");
    expect(card.querySelector("strong")).toHaveTextContent("Retiro Exemplo");
    expect(card.querySelector("small")).toHaveTextContent("Atibaia");
    // no city: no subtitle line
    expect((await screen.findByRole("radio", { name: /Sítio Outro/ })).querySelector("small")).toBeNull();
    expect(screen.getByRole("button", { name: /Cadastrar um novo local/ }).querySelector("img")).toHaveAttribute("src", "/icons/create-new.png");
  });

  it("registers a new venue by name and picks it", async () => {
    places.createVenue.mockResolvedValue({ id: "v3", name: "Sítio Novo", city: null });
    const onChosen = ui();
    fireEvent.click(await screen.findByRole("button", { name: /Cadastrar um novo local/ }));
    const save = screen.getByRole("button", { name: "Salvar local" });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Nome do local"), { target: { value: "Sítio Novo" } });
    fireEvent.click(save);
    await waitFor(() => expect(onChosen).toHaveBeenCalledWith({ id: "v3", name: "Sítio Novo", city: null }));
    expect(places.createVenue).toHaveBeenCalledWith("t", "Sítio Novo");
    expect(places.setCampVenue).toHaveBeenCalledWith("t", "camp-1", "v3");
  });

  it("a refusal reads gently and nothing is chosen", async () => {
    places.setCampVenue.mockRejectedValue(new ApiError(503, "PLACES_UNAVAILABLE", "O cadastro de locais está descansando um instante. Nada foi alterado — tente de novo daqui a pouco."));
    const onChosen = ui();
    fireEvent.click(await screen.findByRole("radio", { name: /Sítio Outro/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("descansando um instante");
    expect(onChosen).not.toHaveBeenCalled();
  });

  it("speaks the five languages", async () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["fr-FR"]);
    ui();
    expect(await screen.findByRole("radiogroup", { name: "Lieux de camp" })).toBeInTheDocument();
  });
});
