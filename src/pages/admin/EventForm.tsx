import { useState } from "react";
import EmojiPicker from "../../components/EmojiPicker";
import TimeInput from "../../components/TimeInput";
import type { CampEvent, CampEventInput } from "../../api/schedule";
import { MultiOptionCards } from "../../components/OptionCards";
import ParentIcon from "../../components/ParentIcon";
import PlacePicker from "../../components/PlacePicker";
import { useVenue } from "../../hooks/useVenue";
import { roleMeta } from "../../roles";
import Toggle from "../../components/Toggle";
import { useAiAutoFill } from "../../hooks/useAiAutoFill";
import { useHideScanFab } from "../../scanFab";
import { useI18n } from "../../i18n";

/** the project roles that can be present at a moment (coordenação is always booked by schedule-api; responsável / participante are the families) */
export const PRESENT_ROLES = ["equipe", "saude", "organizacao", "organizacao-jogos", "pontuacao", "coletes", "fotografia", "checkin", "checkin-onibus"] as const;
type PresentRole = (typeof PRESENT_ROLES)[number];

const EMOJI_SUGGESTIONS = ["📅", "🌅", "🥐", "🍽️", "🍝", "🏊", "🎯", "🌙", "🎤", "🙏", "🎶", "🔥", "🎬", "🛏️", "🚌", "🎁"];

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface EventFormProps {
  token: string;
  event?: CampEvent;
  defaultDate?: string;
  busy?: boolean;
  onSubmit: (input: CampEventInput) => Promise<void>;
  onCancel: () => void;
}

export default function EventForm({ token, event, defaultDate, busy, onSubmit, onCancel }: EventFormProps) {
  useHideScanFab();
  const { tx, te } = useI18n();
  const editing = !!event;
  const [date, setDate] = useState(event?.date ?? defaultDate ?? todayIso());
  const [title, setTitle] = useState(event?.title ?? "");
  const [emoji, setEmoji] = useState(event?.emoji ?? "📅");
  const [startTime, setStartTime] = useState(event?.startTime ?? "08:00");
  const [endTime, setEndTime] = useState(event?.endTime ?? "");
  const [notes, setNotes] = useState(event?.notes ?? "");
  const [coreRoles, setCoreRoles] = useState<string[]>(event?.coreRoles ?? ["equipe"]);
  const [placeIds, setPlaceIds] = useState<string[]>(event?.placeIds ?? []);
  const venue = useVenue(token);
  const [visibleToParents, setVisibleToParents] = useState(event?.visibleToParents ?? true);
  const [error, setError] = useState<string | null>(null);

  const timeOk = /^\d{2}:\d{2}$/.test(startTime) && (!endTime || endTime > startTime);
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const valid = title.trim().length > 0 && timeOk && dateOk;
  const ai = useAiAutoFill({ token, context: "event", title, setTitle, emoji, setEmoji, defaultEmoji: "📅", emojiSuggestions: EMOJI_SUGGESTIONS, existing: editing, html: notes });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setError(null);
    try {
      await onSubmit({
        date,
        title: title.trim(),
        emoji: emoji.trim() || "📅",
        startTime,
        endTime: endTime || null,
        notes: notes.trim(),
        roles: event?.roles ?? [],
        coreRoles,
        placeIds,
        visibleToParents,
      });
    } catch (err) {
      setError(te(err, "Algo deu errado."));
    }
  }

  return (
    <form className="cat-form cat-form--plain" onSubmit={handleSubmit}>
      <div className="cat-form__row">
        <div className="cat-field cat-field--emoji">
          <span className="cat-field__label">{tx("Ícone")}</span>
          <EmojiPicker value={emoji} onChange={ai.pickEmoji} suggestions={EMOJI_SUGGESTIONS} disabled={busy} guessing={ai.suggestingEmoji} />
        </div>
        <label className="cat-field cat-field--grow">
          <span className="cat-field__label">{tx("Título")}</span>
          <input
            className="cat-input"
            placeholder={tx("ex.: Piscina")}
            value={title}
            maxLength={80}
            autoFocus
            disabled={busy}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
      </div>

      <div className="cat-form__row staff-form__row">
        <label className="cat-field">
          <span className="cat-field__label">{tx("Data")}</span>
          <input className="cat-input" type="date" value={date} disabled={busy} required onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="cat-field">
          <span className="cat-field__label">{tx("Início")}</span>
          <TimeInput value={startTime} disabled={busy} required onChange={setStartTime} aria-label={tx("Hora de início")} />
        </label>
        <label className="cat-field">
          <span className="cat-field__label">{tx("Fim (opcional)")}</span>
          <TimeInput value={endTime} disabled={busy} clearable onChange={setEndTime} aria-label={tx("Hora de fim (opcional)")} />
        </label>
      </div>
      {endTime && endTime <= startTime && <p className="cat-hint cat-hint--error">{tx("O fim precisa ser depois do início.")}</p>}

      <div className="cat-field opt-field">
        <div className="opt-field__head">
          <Toggle checked={visibleToParents} onChange={setVisibleToParents} disabled={busy} label={<><ParentIcon size={18} /> {tx("Pais veem")}</>} />
        </div>
        <p className="cat-hint">{tx("Aparece na programação dos pais. A equipe sempre vê.")}</p>
      </div>

      <div className="cat-field">
        <span className="cat-field__label">{tx("Quem está neste momento")}</span>
        <MultiOptionCards<PresentRole>
          label={tx("Quem está neste momento")}
          value={coreRoles.filter((r): r is PresentRole => (PRESENT_ROLES as readonly string[]).includes(r))}
          onChange={(keys) => setCoreRoles([...keys, ...coreRoles.filter((r) => !(PRESENT_ROLES as readonly string[]).includes(r))])}
          disabled={busy}
          row
          options={PRESENT_ROLES.map((r) => ({ key: r, icon: roleMeta(r).icon, title: tx(roleMeta(r).label) }))}
        />
        <p className="cat-hint">{tx("Entram na agenda do IPAlpha de quem serve nestes perfis. A coordenação sempre entra.")}</p>
      </div>

      {venue.venue && venue.places.length > 0 && (
        <div className="cat-field">
          <span className="cat-field__label">{tx("Onde acontece (opcional)")}</span>
          <PlacePicker label={tx("Onde acontece (opcional)")} places={venue.places} value={placeIds} onChange={setPlaceIds} known={event?.places} disabled={busy} />
          <p className="cat-hint">{tx("Locais de {venue}, do cadastro de locais da igreja. Entram na agenda do IPAlpha.", { venue: venue.venue.name })}</p>
        </div>
      )}

      <label className="cat-field">
        <span className="cat-field__label">{tx("Observações (opcional)")}</span>
        <input
          className="cat-input"
          placeholder={tx("ex.: levar apito e prancheta")}
          value={notes}
          maxLength={500}
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
          {busy ? tx("Salvando…") : editing ? tx("Salvar") : tx("Criar evento 🎉")}
        </button>
      </div>
    </form>
  );
}
