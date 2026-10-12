import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import PlacePicker from "./PlacePicker";
import type { VenuePlace } from "../api/places";

/** The programme's "onde acontece": icon option cards (several on at once) — the place pin, a bed for bedrooms. */
const PLACES: VenuePlace[] = [
  { id: "p-hall", name: "Salão", kind: "meeting-room", parentId: "v" },
  { id: "p-room", name: "Quarto 1", kind: "bedroom", parentId: "v" },
];

function Harness({ initial = [] as string[], onChange = vi.fn() }) {
  const [value, setValue] = useState<string[]>(initial);
  return (
    <I18nProvider>
      <PlacePicker label="Onde" places={PLACES} value={value} known={[{ id: "gone-1", name: "Antigo salão", kind: "meeting-room" }]} onChange={(ids) => { setValue(ids); onChange(ids); }} />
    </I18nProvider>
  );
}

describe("PlacePicker — icon option cards", () => {
  beforeEach(() => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["pt-BR"]);
  });

  it("each place is a card with its icon: the place pin, a bed for a bedroom", () => {
    render(<Harness />);
    const hall = screen.getByRole("button", { name: /Salão/ });
    expect(hall).toHaveClass("option-card");
    expect(hall.querySelector("img")).toHaveAttribute("src", "/icons/place.png");
    expect(screen.getByRole("button", { name: /Quarto 1/ }).querySelector("img")).toHaveAttribute("src", "/icons/bed.png");
  });

  it("toggles several places across groups and keeps a place the venue no longer lists until it is dropped", () => {
    const onChange = vi.fn();
    render(<Harness initial={["gone-1"]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Salão/ }));
    fireEvent.click(screen.getByRole("button", { name: /Quarto 1/ }));
    expect(onChange).toHaveBeenLastCalledWith(["gone-1", "p-hall", "p-room"]);
    const gone = screen.getByRole("button", { name: /Antigo salão/ });
    expect(gone).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(gone);
    expect(onChange).toHaveBeenLastCalledWith(["p-hall", "p-room"]);
    fireEvent.click(screen.getByRole("button", { name: /Salão/ }));
    expect(onChange).toHaveBeenLastCalledWith(["p-room"]);
  });
});
