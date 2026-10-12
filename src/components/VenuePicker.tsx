import { useEffect, useState } from "react";
import { createVenue, listVenues, setCampVenue, type VenueSummary } from "../api/places";
import { ICONS } from "../icons";
import { useI18n } from "../i18n";
import OptionCards from "./OptionCards";
import css from "./VenuePicker.module.scss";

interface VenuePickerProps {
  token: string;
  /** the camp the venue is picked for */
  campId: string;
  /** called once the venue is saved */
  onChosen: (venue: VenueSummary) => void;
  /** a venue is already chosen: show a way back without changing it */
  onCancel?: () => void;
}

/**
 * Picks the camp venue from the church's places catalog (places-api): the rooms, beds and address come from there.
 * One option card per venue (the venue icon + its name; the city as the subtitle, which tells two venues apart); a last
 * card registers a new one (name only — the address is completed in Oikos).
 */
export default function VenuePicker({ token, campId, onChosen, onCancel }: VenuePickerProps) {
  const { tx, te } = useI18n();
  const [venues, setVenues] = useState<VenueSummary[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    let alive = true;
    listVenues(token)
      .then((res) => {
        if (!alive) return;
        setVenues(res.venues);
        setSelectedId(res.selectedId);
      })
      .catch((e) => alive && setError(te(e, "Algo deu errado.")));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function choose(venue: VenueSummary) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await setCampVenue(token, campId, venue.id);
      setSelectedId(venue.id);
      onChosen(venue);
    } catch (e) {
      setError(te(e, "Algo deu errado."));
    } finally {
      setBusy(false);
    }
  }

  async function addVenue(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createVenue(token, trimmed);
      setVenues((list) => [...(list ?? []), created]);
      setAdding(false);
      setName("");
      await setCampVenue(token, campId, created.id);
      setSelectedId(created.id);
      onChosen(created);
    } catch (e2) {
      setError(te(e2, "Algo deu errado."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={css.picker} aria-label={tx("Local do acampamento")}>
      <div className={css.head}>
        <h2 className="wizard-card__title">{tx("📍 Onde é o acampamento?")}</h2>
        {onCancel && (
          <button type="button" className="button button--secondary" onClick={onCancel} disabled={busy}>
            {tx("Cancelar")}
          </button>
        )}
      </div>
      <p className="admin-intro">{tx("Escolha o local no cadastro de locais da igreja. Os quartos, as camas e o endereço vêm de lá.")}</p>

      {!venues && !error && (
        <div className={css.options} aria-busy="true">
          <div className={css.skeleton} />
          <div className={css.skeleton} />
        </div>
      )}

      {venues && (
        <div className={css.options}>
          {venues.length > 0 && (
            <OptionCards
              label={tx("Locais de acampamento")}
              options={venues.map((v) => ({ key: v.id, icon: ICONS.venue, title: v.name, ...(v.city ? { subtitle: v.city } : {}) }))}
              value={selectedId}
              disabled={busy}
              onChange={(id) => {
                const venue = venues.find((v) => v.id === id);
                if (venue) void choose(venue);
              }}
            />
          )}
          <button type="button" className={`option-card ${css.option} ${adding ? "option-card--on" : ""}`} aria-expanded={adding} disabled={busy} onClick={() => setAdding((on) => !on)}>
            <img src={ICONS.createNew} alt="" aria-hidden="true" />
            <span>
              <strong>{tx("Cadastrar um novo local")}</strong>
              <small>{tx("Só o nome por aqui; o endereço a secretaria completa.")}</small>
            </span>
          </button>
        </div>
      )}

      {venues && venues.length === 0 && !adding && <p className="opt-empty">{tx("Nenhum local de acampamento cadastrado ainda. Você pode cadastrar o primeiro agora.")}</p>}

      {adding && (
        <form className={css.newVenue} onSubmit={addVenue}>
          <label className="cat-field">
            <span className="cat-field__label">{tx("Nome do local")}</span>
            <input className="cat-input" value={name} maxLength={80} autoFocus disabled={busy} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="cat-form__actions">
            <button type="button" className="button button--secondary" disabled={busy} onClick={() => setAdding(false)}>
              {tx("Cancelar")}
            </button>
            <button type="submit" className="button button--primary" disabled={busy || !name.trim()}>
              {busy ? tx("Salvando…") : tx("Salvar local")}
            </button>
          </div>
        </form>
      )}

      {error && <p className="message message--error" role="alert">{error}</p>}
    </section>
  );
}

interface VenueBadgeProps {
  venue: VenueSummary;
  /** the coordenação can change the venue (until rooms of it are in use) */
  onChange?: () => void;
}

/** The venue icon + "Retiro Exemplo · Atibaia", with a way to change it. */
export function VenueBadge({ venue, onChange }: VenueBadgeProps) {
  const { tx } = useI18n();
  return (
    <div className={css.head}>
      <span className={css.current}>
        <img className={css.currentIcon} src={ICONS.venue} alt="" aria-hidden="true" />
        <span>{venue.name}</span>
        {venue.city && <span className="cat-hint">{venue.city}</span>}
      </span>
      {onChange && (
        <button type="button" className="link-btn" onClick={onChange}>
          {tx("Trocar o local")}
        </button>
      )}
    </div>
  );
}
