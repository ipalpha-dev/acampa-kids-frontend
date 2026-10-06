import { useState } from "react";
import {
  BUS_COLORS,
  TRANSPORT_KINDS,
  TRANSPORT_KIND_META,
  busColorName,
  type Transport,
  type TransportInput,
  type TransportKind,
} from "../../api/transports";
import BusLogo from "../../components/BusLogo";
import { useHideScanFab } from "../../scanFab";
import { useI18n } from "../../i18n";

/** mirrors the server's cap on seats */
const CAPACITY_MAX = 200;

interface TransportFormProps {
  transport?: Transport;
  busy?: boolean;
  onSubmit: (input: TransportInput) => Promise<void>;
  onCancel: () => void;
}

/** Create / edit one vehicle. A BUS carries a colour + number; a CAR does not. */
export default function TransportForm({ transport, busy, onSubmit, onCancel }: TransportFormProps) {
  const { tx, te } = useI18n();
  // the "Ler crachá" FAB would sit on top of Salvar / Cancelar
  useHideScanFab();
  const editing = !!transport;
  const [kind, setKind] = useState<TransportKind>(transport?.kind ?? "bus");
  const [name, setName] = useState(transport?.name ?? "");
  const [color, setColor] = useState(transport?.color ?? BUS_COLORS[0].hex);
  const [number, setNumber] = useState(transport?.number ?? "");
  const [capacity, setCapacity] = useState(transport?.capacity != null ? String(transport.capacity) : "");
  const [error, setError] = useState<string | null>(null);

  const isBus = kind === "bus";
  // capacity is optional, but when typed it must be a whole number of seats
  const capacityNum = Number(capacity.trim());
  const capacityValid =
    capacity.trim() === "" || (Number.isInteger(capacityNum) && capacityNum >= 1 && capacityNum <= CAPACITY_MAX);
  const valid = isBus
    ? /^#[0-9a-fA-F]{6}$/.test(color) && number.trim().length > 0 && capacityValid
    : name.trim().length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setError(null);
    const input: TransportInput = isBus
      ? { kind, color, number: number.trim(), capacity: capacity.trim() === "" ? null : capacityNum }
      : { kind, name: name.trim() };
    try {
      await onSubmit(input);
    } catch (err) {
      setError(te(err, "Algo deu errado."));
    }
  }

  const colorName = busColorName(color);

  return (
    <form className="cat-form cat-form--plain transport-form" onSubmit={handleSubmit}>
      <h2 className="cat-form__title change-room__title">
        {editing ? tx("✏️ Editar transporte") : tx("Novo transporte")}
      </h2>

      <fieldset className="cat-fieldset">
        <legend className="cat-field__label">{tx("Tipo")}</legend>
        <div className="chip-group">
          {TRANSPORT_KINDS.map((k) => {
            const m = TRANSPORT_KIND_META[k];
            const on = kind === k;
            return (
              <button
                key={k}
                type="button"
                className={`chip-toggle ${on ? "chip-toggle--on" : ""}`}
                aria-pressed={on}
                onClick={() => setKind(k)}
              >
                {m.icon && <img className="chip-toggle__icon" src={m.icon} alt="" aria-hidden="true" />}{" "}
                {tx(m.label)}
              </button>
            );
          })}
        </div>
      </fieldset>

      {!isBus && (
        <label className="cat-field">
          <span className="cat-field__label">{tx("Nome")}</span>
          <input
            className="cat-input"
            placeholder={tx("ex.: Carro do João")}
            value={name}
            maxLength={60}
            autoFocus
            onChange={(e) => setName(e.target.value)}
          />
        </label>
      )}

      {isBus && (
        <>
          <label className="cat-field">
            <span className="cat-field__label">{tx("Número do ônibus")}</span>
            <input
              className="cat-input"
              placeholder={tx("ex.: 1")}
              value={number}
              maxLength={8}
              inputMode="numeric"
              autoFocus
              onChange={(e) => setNumber(e.target.value)}
            />
          </label>

          <label className="cat-field">
            <span className="cat-field__label">
              {tx("Capacidade (lugares)")} <em className="cat-field__hint">{tx("· opcional")}</em>
            </span>
            <input
              className="cat-input"
              placeholder={tx("ex.: 46")}
              value={capacity}
              maxLength={3}
              inputMode="numeric"
              onChange={(e) => setCapacity(e.target.value.replace(/\D/g, ""))}
            />
          </label>

          <div className="cat-field">
            <span className="cat-field__label">{tx("Cor do ônibus")} {colorName ? <em className="cat-field__hint">· {tx(colorName)}</em> : null}</span>
            <div className="swatch-group">
              {BUS_COLORS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  className={`swatch swatch--bus-${c.key} ${color.toLowerCase() === c.hex ? "swatch--on" : ""}`}
                  title={tx(c.name)}
                  aria-label={tx(c.name)}
                  aria-pressed={color.toLowerCase() === c.hex}
                  onClick={() => setColor(c.hex)}
                />
              ))}
              <label className="swatch swatch--custom" title={tx("Cor personalizada")}>
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  aria-label={tx("Cor personalizada")}
                />
              </label>
            </div>
          </div>

          <div className="transport-preview">
            <BusLogo color={color} number={number.trim() || undefined} size={52} />
            <p className="cat-hint">
              {tx("O nome do ônibus é automático:")}{" "}
              <strong>
                {[tx("Ônibus"), number.trim()].filter(Boolean).join(" ")}
                {colorName ? ` - ${tx(colorName)}` : ""}
              </strong>
              .
            </p>
          </div>
        </>
      )}

      {error && <p className="message message--error">{error}</p>}

      <div className="cat-form__actions">
        <button type="button" className="button button--secondary" onClick={onCancel} disabled={busy}>
          {tx("Cancelar")}
        </button>
        <button type="submit" className="button button--primary" disabled={!valid || busy}>
          {busy ? tx("Salvando…") : editing ? tx("Salvar") : tx("Criar 🎉")}
        </button>
      </div>
    </form>
  );
}
