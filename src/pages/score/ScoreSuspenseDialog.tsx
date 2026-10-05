import { useEffect, useState, type FormEvent } from "react";
import { setScoreSuspense } from "../../api/scores";
import type { CheckinWindow } from "../../api/settings";
import Dialog from "../../components/Dialog";
import { speakWhen } from "../../dates";
import { ICONS } from "../../icons";
import { useI18n } from "../../i18n";
import { suspenseState } from "../../scoreSuspense";

interface ScoreSuspenseDialogProps {
  token: string;
  open: boolean;
  onClose: () => void;
  /** the window as it is saved now */
  current: Pick<CheckinWindow, "from" | "until"> | undefined;
}

/** ISO instant → value for <input type="datetime-local"> (device clock) */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local value → ISO instant (device clock), or null when empty / invalid */
function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** now, rounded down to the minute (datetime-local has no seconds) */
function nowIso(): string {
  const d = new Date();
  d.setSeconds(0, 0);
  return d.toISOString();
}

const HOURS_LATER = [1, 3, 6];

/**
 * Schedules the scoreboard suspense window. The copy intentionally speaks only
 * to the game organizer: the team loses the totals, while the organizer keeps
 * recording and seeing points until the automatic reveal.
 */
export default function ScoreSuspenseDialog({ token, open, onClose, current }: ScoreSuspenseDialogProps) {
  const { tx, te } = useI18n();
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const state = suspenseState(current);
    const active = state.kind === "on" || state.kind === "scheduled";
    setFrom(toLocalInput(active ? state.from : nowIso()));
    setUntil(toLocalInput(active ? state.until : null));
    setError(null);
  }, [open, current]);

  const fromIso = fromLocalInput(from);
  const untilIso = fromLocalInput(until);
  const orderOk = !fromIso || !untilIso || new Date(fromIso) < new Date(untilIso);
  const complete = !!fromIso && !!untilIso;
  const untilPast = !!untilIso && new Date(untilIso).getTime() <= Date.now();
  const preview = complete && orderOk ? suspenseState({ from: fromIso, until: untilIso }).kind : null;
  const isSet = !!current?.from && !!current?.until;

  function laterBy(hours: number) {
    const base = fromIso ? new Date(fromIso) : new Date(nowIso());
    if (!fromIso) setFrom(toLocalInput(base.toISOString()));
    setUntil(toLocalInput(new Date(base.getTime() + hours * 3600_000).toISOString()));
  }

  async function save(window: { from: string | null; until: string | null }) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await setScoreSuspense(token, window);
      onClose();
    } catch (e) {
      setError(te(e, "Algo deu errado."));
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!complete || !orderOk || untilPast) return;
    void save({ from: fromIso, until: untilIso });
  }

  return (
    <Dialog open={open} onClose={onClose} title={tx("Programar suspense")} width={580} className="suspense-dialog" fullscreenOnMobile>
      <form className="cat-form cat-form--plain suspense-form" onSubmit={submit}>
        <header className="suspense-dialog__intro">
          <img className="suspense-dialog__img" src={ICONS.scoreSuspense} alt="" aria-hidden="true" />
          <div>
            <h2 className="cat-form__title">{tx("Programar suspense")}</h2>
            <p className="cat-hint">{tx("Esconda os pontos até a hora de anunciar o resultado.")}</p>
          </div>
        </header>

        <div className="suspense-dialog__summary">
          <p><strong>{tx("O organizador dos jogos")}</strong> {tx("continua lançando e vendo os pontos.")}</p>
          <p><strong>{tx("No fim")}</strong> {tx("o placar reaparece sozinho.")}</p>
        </div>

        <div className="cat-form__row staff-form__row suspense-dialog__times">
          <label className="cat-field cat-field--grow">
            <span className="cat-field__label">{tx("Esconder a partir de")}</span>
            <input className="cat-input" type="datetime-local" value={from} disabled={busy} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="cat-field cat-field--grow">
            <span className="cat-field__label">{tx("Revelar em")}</span>
            <input className="cat-input" type="datetime-local" value={until} min={from || undefined} disabled={busy} onChange={(e) => setUntil(e.target.value)} />
          </label>
        </div>

        <div className="chip-group suspense-chips" aria-label={tx("Atalhos de horário")}>
          <button type="button" className="chip-toggle chip-toggle--small" disabled={busy} onClick={() => setFrom(toLocalInput(nowIso()))}>
            {tx("Agora")}
          </button>
          {HOURS_LATER.map((h) => (
            <button key={h} type="button" className="chip-toggle chip-toggle--small" disabled={busy} onClick={() => laterBy(h)}>
              +{h} h
            </button>
          ))}
        </div>

        {!orderOk && <p className="cat-hint cat-hint--error">{tx("A revelação precisa ser depois do início.")}</p>}
        {orderOk && untilPast && <p className="cat-hint cat-hint--error">{tx("A revelação já passou — escolha um horário no futuro.")}</p>}
        {preview && fromIso && untilIso && !untilPast && (
          <p className={`message suspense-dialog__preview ${preview === "on" ? "message--warn" : "message--ok"}`}>
            {preview === "on"
              ? tx("Esconde agora e revela {until}.", { until: speakWhen(untilIso) })
              : tx("Esconde {from} e revela {until}.", { from: speakWhen(fromIso), until: speakWhen(untilIso) })}
          </p>
        )}
        {error && <p className="message message--error">{error}</p>}

        <div className="cat-form__actions suspense-dialog__actions">
          <button type="button" className="button button--secondary" disabled={busy} onClick={onClose}>
            {tx("Cancelar")}
          </button>
          {isSet && (
            <button type="button" className="button button--secondary" disabled={busy} onClick={() => void save({ from: null, until: null })}>
              {tx("Remover suspense")}
            </button>
          )}
          <button type="submit" className="button button--primary" disabled={busy || !complete || !orderOk || untilPast}>
            {busy ? tx("Salvando…") : tx("Salvar")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
