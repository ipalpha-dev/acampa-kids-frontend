import { useState } from "react";
import { BEDROOM_GROUPS, GROUP_META, type Bedroom, type BedroomGroup, type BedroomInput } from "../../api/bedrooms";
import BunkIcon from "../../components/BunkIcon";
import GroupIcon from "../../components/GroupIcon";
import { ICONS } from "../../icons";
import { useHideScanFab } from "../../scanFab";
import { useI18n } from "../../i18n";
import css from "./staffGroup.module.scss";

interface BedroomFormProps {
  bedroom?: Bedroom;
  /** pre-select a group when creating from a group header */
  defaultGroup?: BedroomGroup;
  busy?: boolean;
  onSubmit: (input: BedroomInput) => Promise<void>;
  onCancel: () => void;
}

const BEDS_MAX = 50;

/** Create / edit a bedroom: number, wing and bed layout (bunk + single). */
export default function BedroomForm({ bedroom, defaultGroup, busy, onSubmit, onCancel }: BedroomFormProps) {
  const { tx } = useI18n();
  // the "Ler crachá" FAB would sit on top of Salvar / Cancelar
  useHideScanFab();
  const editing = !!bedroom;
  const [name, setName] = useState(bedroom?.name ?? "");
  const [group, setGroup] = useState<BedroomGroup>(bedroom?.group ?? defaultGroup ?? "girls");
  const [bunkBeds, setBunkBeds] = useState<number | null>(bedroom?.bunkBeds ?? 2);
  const [singleBeds, setSingleBeds] = useState<number | null>(bedroom?.singleBeds ?? 0);
  const [notes, setNotes] = useState(bedroom?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  const bunk = bunkBeds ?? 0;
  const singles = singleBeds ?? 0;
  const bedsOk = bunkBeds !== null && singleBeds !== null && Number.isInteger(bunkBeds) && Number.isInteger(singleBeds) && bunkBeds >= 0 && singleBeds >= 0;
  const capacity = bunk * 2 + singles;
  const valid = name.trim().length > 0 && bedsOk && capacity > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || bunkBeds === null || singleBeds === null) return;
    setError(null);
    try {
      await onSubmit({ name: name.trim(), group, bunkBeds, singleBeds, notes: notes.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : tx("Algo deu errado."));
    }
  }

  function renderCounter(label: React.ReactNode, aria: string, hint: string, value: number | null, set: (n: number | null) => void) {
    const clamp = (n: number) => Math.max(0, Math.min(BEDS_MAX, n));
    const shown = value ?? 0;
    return (
      <div className="cat-field cat-field--grow">
        <span className="cat-field__label cat-field__label--icon">{label}</span>
        <div className="counter">
          <button type="button" className="counter__btn" disabled={busy || shown <= 0} onClick={() => set(clamp(shown - 1))}>
            −
          </button>
          <input
            className="counter__input"
            type="number"
            inputMode="numeric"
            min={0}
            max={BEDS_MAX}
            value={value ?? ""}
            disabled={busy}
            onChange={(e) => {
              const raw = e.target.value;
              set(raw === "" ? null : clamp(Number(raw) || 0));
            }}
            aria-label={aria}
          />
          <button type="button" className="counter__btn" disabled={busy || shown >= BEDS_MAX} onClick={() => set(clamp(shown + 1))}>
            +
          </button>
        </div>
        <span className="cat-hint">{hint}</span>
      </div>
    );
  }

  return (
    <form className="cat-form cat-form--plain" onSubmit={handleSubmit}>
      <div className="cat-form__row staff-form__row">
        <label className={`cat-field ${css.capacityField}`}>
          <span className="cat-field__label">{tx("Número")}</span>
          <input
            className="cat-input"
            placeholder={tx("ex.: 103")}
            value={name}
            maxLength={30}
            autoFocus
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <fieldset className="cat-fieldset cat-field--grow">
          <legend className="cat-field__label">{tx("Ala")}</legend>
          <div className="chip-group">
            {BEDROOM_GROUPS.map((g) => {
              const m = GROUP_META[g];
              const on = group === g;
              return (
                <button
                  key={g}
                  type="button"
                  className={`chip-toggle ${on ? "chip-toggle--on" : ""}`}
                  aria-pressed={on}
                  disabled={busy}
                  onClick={() => setGroup(g)}
                >
                  <GroupIcon group={g} /> {tx(m.label)}
                </button>
              );
            })}
          </div>
        </fieldset>
      </div>

      <div className="cat-form__row staff-form__row">
        {renderCounter(<><BunkIcon size={18} /> {tx("Beliches")}</>, tx("Beliches"), tx("cada beliche dorme 2"), bunkBeds, setBunkBeds)}
        {renderCounter(<><img className="audience-icon" src={ICONS.bed} alt="" aria-hidden="true" /> {tx("Camas de solteiro")}</>, tx("Camas de solteiro"), tx("cada cama dorme 1"), singleBeds, setSingleBeds)}
        <div className="cat-field capacity-box">
          <span className="cat-field__label">{tx("Capacidade")}</span>
          <span className="capacity-box__value">{capacity}</span>
          <span className="cat-hint">{capacity === 1 ? tx("pessoa") : tx("pessoas")}</span>
        </div>
      </div>
      {capacity === 0 && <p className="cat-hint cat-hint--error">{tx("O quarto precisa ter ao menos uma cama.")}</p>}

      <label className="cat-field">
        <span className="cat-field__label">{tx("Observações (opcional)")}</span>
        <input
          className="cat-input"
          placeholder={tx("ex.: fica ao lado da enfermaria")}
          value={notes}
          maxLength={300}
          disabled={busy}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>

      {error && <p className="message message--error">{error}</p>}

      <div className="cat-form__actions">
        <button type="button" className="button button--secondary" onClick={onCancel} disabled={busy}>
          {tx("Cancelar")}
        </button>
        <button type="submit" className="button button--primary" disabled={!valid || busy}>
          {busy ? tx("Salvando…") : editing ? tx("Salvar") : tx("Criar quarto 🎉")}
        </button>
      </div>
    </form>
  );
}
