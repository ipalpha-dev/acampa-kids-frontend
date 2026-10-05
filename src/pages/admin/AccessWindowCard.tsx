import { useEffect, useState, type ReactNode } from "react";
import { updateSettings, type Settings } from "../../api/settings";
import { useCollection } from "../../store";
import { useRoute } from "../../router";
import { speakWhen } from "../../dates";
import { ICONS } from "../../icons";
import { useI18n } from "../../i18n";

interface AccessWindowCardProps {
  token: string;
  /** which window this card edits */
  which: "staffAccessWindow" | "parentAccessWindow";
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

type Tx = (pt: string, vars?: Record<string, string | number>) => string;

function buildMeta(tx: Tx): Record<AccessWindowCardProps["which"], { title: ReactNode; hint: string; who: "a equipe" | "os pais"; toggle: "enrolments" | "parentWelcome"; toggleLabel: string }> {
  return {
    staffAccessWindow: {
      title: tx("🕒 Janela de acesso da equipe"),
      hint: tx("Nesse período a equipe tem acesso ao app e recebe os SMS."),
      who: "a equipe",
      toggle: "enrolments" as const,
      toggleLabel: tx("Boas-vindas e novas responsabilidades"),
    },
    parentAccessWindow: {
      title: (
        <>
          <img className="admin-title__icon" src={ICONS.parent} alt="" aria-hidden="true" /> {tx("Janela de acesso dos pais")}
        </>
      ),
      hint: tx("Nesse período os pais conseguem entrar no app. Os contatos da equipe eles só veem a partir do horário do check-in até o fim do acampamento."),
      who: "os pais",
      toggle: "parentWelcome" as const,
      toggleLabel: tx("Boas-vindas aos pais"),
    },
  };
}

/**
 * Settings → Geral: one ACCESS window (team or parents). Outside it the
 * server sends those people nothing and logs them out. When the window
 * opens, the matching welcome SMS goes out (once per person) — IF its toggle
 * is on: the card says so, in yellow when it is off.
 */
export default function AccessWindowCard({ token, which }: AccessWindowCardProps) {
  const { tx, te } = useI18n();
  const settings = useCollection("settings");
  const { navigate } = useRoute();
  const m = buildMeta(tx)[which];
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");

  function fill(s: Settings) {
    setFrom(toLocalInput(s[which]?.from ?? null));
    setUntil(toLocalInput(s[which]?.until ?? null));
  }
  useEffect(() => {
    if (settings) fill(settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, which]);

  const fromIso = fromLocalInput(from);
  const untilIso = fromLocalInput(until);
  const orderOk = !fromIso || !untilIso || new Date(fromIso) < new Date(untilIso);
  const current = settings?.[which] ?? { from: null, until: null };
  const dirty = !!settings && (!sameMinute(fromIso, current.from) || !sameMinute(untilIso, current.until));
  const now = Date.now();
  const openNow = (!fromIso || new Date(fromIso).getTime() <= now) && (!untilIso || now < new Date(untilIso).getTime());
  const smsOn = !!settings?.notifications[m.toggle];

  async function save() {
    if (busy || !orderOk) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await updateSettings(token, { [which]: { from: fromIso, until: untilIso } });
      setSaved(true);
    } catch (e) {
      setError(te(e, "Algo deu errado."));
    } finally {
      setBusy(false);
    }
  }

  let status: ReactNode = null;
  if (!orderOk) {
    status = <p className="cat-hint cat-hint--error">{tx("O fim da janela precisa ser depois do início.")}</p>;
  } else if (!fromIso && !untilIso) {
    status = (
      <p className="cat-hint">
        {m.who === "os pais"
          ? tx("🟢 Sem restrição — os pais acessam a qualquer hora.")
          : tx("🟢 Sem restrição — a equipe acessa a qualquer hora.")}
      </p>
    );
  } else if (openNow) {
    status = (
      <p className="cat-hint">
        {untilIso
          ? tx("🟢 Aberta agora — fecha {when}.", { when: speakWhen(untilIso) })
          : tx("🟢 Aberta agora.")}
      </p>
    );
  } else if (fromIso && new Date(fromIso).getTime() > now) {
    status = (
      <p className="cat-hint">
        {untilIso
          ? tx("🕒 Abre {from} até {until}.", { from: speakWhen(fromIso), until: speakWhen(untilIso) })
          : tx("🕒 Abre {when}.", { when: speakWhen(fromIso) })}
      </p>
    );
  } else {
    status = (
      <p className="cat-hint">
        {untilIso
          ? tx("⚫ Fechada desde {when}.", { when: speakWhen(untilIso) })
          : tx("⚫ Fechada.")}
      </p>
    );
  }

  return (
    <form
      className="cat-form"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <h2 className="cat-form__title">{m.title}</h2>
      <p className="cat-hint">{m.hint}</p>
      <div className="cat-form__row staff-form__row">
        <label className="cat-field cat-field--grow">
          <span className="cat-field__label">{tx("Abre em")}</span>
          <input className="cat-input" type="datetime-local" value={from} disabled={busy} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="cat-field cat-field--grow">
          <span className="cat-field__label">{tx("Fecha em")}</span>
          <input className="cat-input" type="datetime-local" value={until} disabled={busy} onChange={(e) => setUntil(e.target.value)} />
        </label>
      </div>
      {status}
      {settings &&
        (smsOn ? (
          <p className="message message--ok">
            {m.who === "os pais" ? (
              <>
                {tx("📲 Quando a janela abrir, os pais")}{" "}
                <strong>{tx("recebem o SMS de boas-vindas")}</strong>{" "}
                {tx("com o link do app (uma única vez por pessoa).")}
              </>
            ) : (
              <>
                {tx("📲 Quando a janela abrir, a equipe")}{" "}
                <strong>{tx("recebe o SMS de boas-vindas")}</strong>{" "}
                {tx("com o link do app (uma única vez por pessoa).")}
              </>
            )}
          </p>
        ) : (
          <p className="message message--warn">
            {tx("O SMS de boas-vindas está desligado.")}{" "}
            <a href="#/notifications" onClick={(e) => { e.preventDefault(); navigate("/notifications"); }}>{tx("Ligar em Notificações")}</a>
          </p>
        ))}
      {error && <p className="message message--error">{error}</p>}
      {saved && <p className="message message--ok">{tx("✅ Janela de acesso salva.")}</p>}
      <div className="cat-form__actions">
        <button type="submit" className="button button--primary" disabled={!orderOk || !dirty || busy}>
          {busy ? tx("Salvando…") : <>{tx("Salvar")}<span className="btn-extra"> {tx("horário 🕒")}</span></>}
        </button>
      </div>
    </form>
  );
}
