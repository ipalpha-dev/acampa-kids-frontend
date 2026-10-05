import { useEffect, useState } from "react";
import { updateSettings } from "../../api/settings";
import Toggle from "../../components/Toggle";
import { useCollection } from "../../store";
import { speakWhen } from "../../dates";
import { useI18n } from "../../i18n";

interface CheckinReminderCardProps {
  token: string;
  /** compact: no card frame (used inside the Notificações list) */
  embedded?: boolean;
}

/** ISO instant → value for <input type="datetime-local"> (device clock) */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local value → ISO instant (device clock), or null when empty */
function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const sameMinute = (a: string | null, b: string | null) => (a ? Math.floor(new Date(a).getTime() / 60_000) : null) === (b ? Math.floor(new Date(b).getTime() / 60_000) : null);

/**
 * Settings → Geral AND → Notificações: the instant at which the WHOLE team is
 * texted "chegou a hora do seu check-in". Same data on both tabs (the settings
 * collection). Nothing goes out while the date is empty or the toggle is off;
 * it is sent once per date — picking a new date re-arms it.
 */
export default function CheckinReminderCard({ token, embedded }: CheckinReminderCardProps) {
  const { tx, te } = useI18n();
  const settings = useCollection("settings");
  const [at, setAt] = useState("");
  const [busy, setBusy] = useState<"date" | "toggle" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const current = settings?.checkinReminder ?? { at: null, sentAt: null };
  const on = !!settings?.notifications.checkinReminder;

  useEffect(() => {
    setAt(toLocalInput(current.at));
  }, [current.at]);

  const atIso = fromLocalInput(at);
  const dirty = !!settings && !sameMinute(atIso, current.at);
  const past = !!atIso && new Date(atIso).getTime() <= Date.now();

  async function run(kind: "date" | "toggle", patch: Parameters<typeof updateSettings>[1]) {
    if (busy) return;
    setBusy(kind);
    setError(null);
    setSaved(false);
    try {
      await updateSettings(token, patch);
      if (kind === "date") setSaved(true);
    } catch (e) {
      setError(te(e, "Algo deu errado."));
    } finally {
      setBusy(null);
    }
  }

  const status = !current.at
    ? tx("⚫ Sem data — nenhum lembrete será enviado.")
    : current.sentAt
      ? tx("✅ Enviado {when}. Escolha outra data para enviar de novo.", { when: speakWhen(current.sentAt) })
      : !on
        ? tx("⏸️ Marcado para {when}, mas o aviso está desligado — ligue para enviar.", { when: speakWhen(current.at) })
        : new Date(current.at).getTime() > Date.now()
          ? tx("🕒 Será enviado {when}.", { when: speakWhen(current.at) })
          : tx("📲 Enviando…");

  return (
    <section className={`cat-form ${embedded ? "cat-form--embedded" : ""}`}>
      <div className="cat-form__head">
        <h2 className="cat-form__title">{tx("⏰ Lembrete de check-in para a equipe")}</h2>
        <Toggle checked={on} disabled={!settings || busy !== null} label={on ? tx("Ligado") : tx("Desligado")} onChange={(v) => void run("toggle", { notifications: { checkinReminder: v } })} />
      </div>
      <p className="cat-hint">
        {tx("Na data e hora abaixo")} <strong>{tx("toda a equipe")}</strong> {tx("recebe um SMS lembrando de fazer o self check-in.")}
      </p>
      <form
        className="cat-form__row staff-form__row reminder-save"
        onSubmit={(e) => {
          e.preventDefault();
          void run("date", { checkinReminder: { at: atIso } });
        }}
      >
        <label className="cat-field cat-field--grow">
          <span className="cat-field__label">{tx("Enviar em")}</span>
          <input className="cat-input" type="datetime-local" value={at} disabled={!settings || busy !== null} onChange={(e) => setAt(e.target.value)} />
        </label>
        <div className="cat-form__actions">
          <button type="submit" className="button button--primary" disabled={!settings || !dirty || busy !== null}>
            {busy === "date" ? tx("Salvando…") : <>{tx("Salvar")}<span className="btn-extra"> {tx("data ⏰")}</span></>}
          </button>
        </div>
      </form>
      {dirty && past && <p className="cat-hint cat-hint--error">{tx("Essa data já passou: ao salvar, o lembrete sai imediatamente (se o aviso estiver ligado).")}</p>}
      <p className="cat-hint">{status}</p>
      {saved && <p className="message message--ok">{tx("✅ Lembrete salvo.")}</p>}
      {error && <p className="message message--error">{error}</p>}
    </section>
  );
}
