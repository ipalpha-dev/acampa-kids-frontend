import { useMemo } from "react";
import type { EventPlace, PlaceKind, VenuePlace } from "../api/places";
import { useI18n } from "../i18n";
import { ICONS } from "../icons";
import { MultiOptionCards } from "./OptionCards";
import css from "./PlacePicker.module.scss";

interface PlacePickerProps {
  /** the places of the camp venue (any depth) */
  places: VenuePlace[];
  /** the picked place ids */
  value: readonly string[];
  onChange: (ids: string[]) => void;
  /** names of picked ids the venue no longer lists (so they can still be dropped) */
  known?: readonly EventPlace[];
  disabled?: boolean;
  label: string;
}

/** the card icon: a bedroom is a bed (the Quartos icon); every other place of the venue is the place pin */
const iconOf = (kind: PlaceKind) => (kind === "bedroom" ? ICONS.bed : ICONS.place);
const KIND_ORDER: PlaceKind[] = ["meeting-room", "sanctuary", "kitchen", "classroom", "office", "floor", "wing", "bedroom"];
const KIND_LABEL: Partial<Record<PlaceKind, string>> = {
  "meeting-room": "Salões e salas",
  sanctuary: "Espaços de celebração",
  kitchen: "Cozinha",
  classroom: "Salas de aula",
  office: "Escritórios",
  floor: "Andares",
  wing: "Alas",
  bedroom: "Quartos",
};

/**
 * Where a programme moment happens: pick any number of places of the camp venue (places-api). One group per kind,
 * icon option cards (several can be on at once); a picked place the venue no longer lists stays as a card to drop.
 */
export default function PlacePicker({ places, value, onChange, known = [], disabled, label }: PlacePickerProps) {
  const { tx } = useI18n();
  const groups = useMemo(() => {
    const byKind = new Map<PlaceKind, VenuePlace[]>();
    for (const p of places) byKind.set(p.kind, [...(byKind.get(p.kind) ?? []), p]);
    return KIND_ORDER.filter((k) => byKind.has(k)).map((k) => ({ kind: k, items: byKind.get(k)! }));
  }, [places]);
  const listed = new Set(places.map((p) => p.id));
  const gone = value.filter((id) => !listed.has(id));

  return (
    <div className={css.picker} role="group" aria-label={label}>
      {groups.map((g) => (
        <div key={g.kind} className={css.group}>
          <span className={css.groupTitle}>{tx(KIND_LABEL[g.kind] ?? "Locais")}</span>
          <MultiOptionCards
            row
            label={tx(KIND_LABEL[g.kind] ?? "Locais")}
            options={g.items.map((p) => ({ key: p.id, icon: iconOf(p.kind), title: p.name }))}
            value={value.filter((id) => g.items.some((p) => p.id === id))}
            disabled={disabled}
            onChange={(ids) => onChange([...value.filter((id) => !g.items.some((p) => p.id === id)), ...ids])}
          />
        </div>
      ))}
      {gone.length > 0 && (
        <div className={`${css.group} ${css.gone}`}>
          <span className={css.groupTitle}>{tx("Fora do local do acampamento")}</span>
          <MultiOptionCards
            row
            label={tx("Fora do local do acampamento")}
            options={gone.map((id) => ({ key: id, icon: ICONS.place, title: known.find((k) => k.id === id)?.name ?? tx("Local do cadastro da igreja"), subtitle: tx("Tirar este local") }))}
            value={gone}
            disabled={disabled}
            onChange={(ids) => onChange(value.filter((id) => !gone.includes(id) || ids.includes(id)))}
          />
        </div>
      )}
    </div>
  );
}
