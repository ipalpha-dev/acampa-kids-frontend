import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CheckGlyph, UndoGlyph } from "../components/Glyph";
import SearchField from "../components/SearchField";
import { setStaffVest, staffSex, type Staff, type VestAction } from "../api/staff";
import Breadcrumbs from "../components/Breadcrumbs";
import { ICONS, vestSrc } from "../icons";
import PersonContact from "../components/PersonContact";
import { useRoute } from "../router";
import { useCollection, useCollectionOrEmpty } from "../store";
import { speakStamp } from "../dates";
import { collatorLocale, useI18n } from "../i18n";

interface VestPageProps {
  token: string;
  /** merged admin Check-in landing page */
  checkinHomePath?: string;
}

type Step = "pending" | "out" | "back";
type Tab = "all" | "deliver" | "return";

/** how long a ticked box waits before the row fades away (a re-tap in the meantime undoes it) */
const TICK_DELAY_MS = 3000;
/** fade-out + collapse of a row that left the list (matches `vest-leave` in styles.css) */
const LEAVE_MS = 650;

const STEP_META: Record<Step, { label: string }> = {
  pending: { label: "Sem colete" },
  out: { label: "Com a pessoa" },
  back: { label: "Devolvido" },
};

/** the step a person must be in to show up on a step tab */
const TAB_STEP: Record<Exclude<Tab, "all">, Step> = { deliver: "pending", return: "out" };

function stepOf(s: Staff): Step {
  if (!s.vest?.delivered) return "pending";
  return s.vest.returned ? "back" : "out";
}

/**
 * Which tab opens by default, from the check-in window: before it → Todos,
 * while it is open → Entregar (hand-out time), after it → Com o tio
 * (collect time). Unset window → Todos.
 */
function defaultTab(w: { from: string | null; until: string | null } | undefined, testMode: boolean | undefined, now = Date.now()): Tab {
  if (testMode) return "deliver";
  if (!w?.from || !w.until) return "all";
  const from = new Date(w.from).getTime();
  const until = new Date(w.until).getTime();
  if (now < from) return "all";
  if (now < until) return "deliver";
  return "return";
}

/** status mark: bare shoulders → wearing the vest → ticked box */
function StepIcon({ step, sex, className = "" }: { step: Step; sex?: "F" | "M" | null; className?: string }) {
  const { tx } = useI18n();
  const label = tx(STEP_META[step].label);
  if (step === "back") {
    return (
      <span className={`bus-row__check bus-row__check--on ${className}`} title={label} aria-label={label} role="img">
        <CheckGlyph size="1.2em" />
      </span>
    );
  }
  return <img className={`vest-row__icon ${className}`} src={vestSrc(step === "out", sex)} alt={label} title={label} />;
}

/**
 * Team vest (colete) check-out / check-in.
 *   Todos      → every team member, the status icon on the left and the
 *                hand-out / take-back / undo buttons on the right.
 *   Entregar   → only the ones still without a vest: tick = delivered.
 *   Com o tio  → only the ones wearing a vest: tick = returned.
 * On the step tabs a tick waits 3 s (tap again to undo), then the row fades
 * out and the list closes the gap. Searching there also lists everyone
 * else who matches below a divider, in the "Todos" layout.
 * Once the check-in window is over, a vest still out is late → yellow row.
 * For the coordenação and the `coletes` role; the helper sees only the name (the phone is read on tap).
 */
export default function VestPage({ token, checkinHomePath }: VestPageProps) {
  const { tx } = useI18n();
  const staff = useCollection("staff");
  const bedrooms = useCollectionOrEmpty("bedrooms");
  const settings = useCollection("settings");
  const { navigate } = useRoute();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());
  /** ticked on a step tab, waiting the 3 s before it goes */
  const [armed, setArmed] = useState<Set<string>>(new Set());
  /** fading out of the list (the API call is running / just finished) */
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const timers = useRef<Map<string, number>>(new Map());
  const [error, setError] = useState<string | null>(null);

  // pick the default tab once the settings arrive; the person's own choice wins afterwards
  useEffect(() => {
    if (tab !== null || !settings) return;
    setTab(defaultTab(settings.checkinWindow, settings.checkinTestMode));
  }, [settings, tab]);
  const filter: Tab = tab ?? "all";

  const TABS: { key: Tab; label: string; icon: ReactNode }[] = [
    { key: "all", label: tx("Todos"), icon: <img className="cat-tab__img" src={ICONS.staffPair} alt="" /> },
    { key: "deliver", label: tx("Entregar"), icon: "📦" },
    { key: "return", label: tx("Com o tio"), icon: <img className="cat-tab__img" src={ICONS.vest} alt="" /> },
  ];

  const windowOver = useMemo(() => {
    const until = settings?.checkinWindow?.until;
    return !!until && Date.now() > new Date(until).getTime();
  }, [settings]);

  const active = useMemo(() => staff?.filter((s) => s.active) ?? [], [staff]);
  const counts = useMemo(() => {
    const c: Record<Step, number> = { pending: 0, out: 0, back: 0 };
    for (const s of active) c[stepOf(s)]++;
    return c;
  }, [active]);

  const clearTimer = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t !== undefined) window.clearTimeout(t);
    timers.current.delete(id);
  }, []);
  const disarm = useCallback(
    (id: string) => {
      clearTimer(id);
      setArmed((a) => {
        if (!a.has(id)) return a;
        const n = new Set(a);
        n.delete(id);
        return n;
      });
    },
    [clearTimer],
  );

  // switching tabs drops every tick still waiting; unmount clears the timers
  useEffect(() => {
    return () => {
      for (const id of Array.from(timers.current.keys())) disarm(id);
    };
  }, [filter, disarm]);

  const { main, others } = useMemo(() => {
    const q = normalize(search);
    const byName = (a: Staff, b: Staff) => a.name.localeCompare(b.name, collatorLocale(), { sensitivity: "base" });
    const matches = (s: Staff) => !q || normalize(s.name).includes(q);
    if (filter === "all") return { main: active.filter(matches).sort(byName), others: [] as Staff[] };
    const step = TAB_STEP[filter];
    // a row that is fading out stays until the animation is over, whatever its step now
    const onTab = (s: Staff) => stepOf(s) === step || leaving.has(s.id);
    return {
      main: active.filter((s) => onTab(s) && matches(s)).sort(byName),
      others: q ? active.filter((s) => !onTab(s) && matches(s)).sort(byName) : [],
    };
  }, [active, search, filter, leaving]);

  async function run(s: Staff, action: VestAction) {
    if (pending.has(s.id)) return false;
    setPending((p) => new Set(p).add(s.id));
    setError(null);
    try {
      await setStaffVest(token, s.id, action);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : tx("Algo deu errado."));
      return false;
    } finally {
      setPending((p) => {
        const n = new Set(p);
        n.delete(s.id);
        return n;
      });
    }
  }

  /** fade the row out of the step tab while the action is stamped */
  function leave(s: Staff, action: VestAction) {
    setLeaving((l) => new Set(l).add(s.id));
    const started = Date.now();
    void run(s, action).then((ok) => {
      const wait = ok ? Math.max(0, LEAVE_MS - (Date.now() - started)) : 0;
      window.setTimeout(() => {
        setLeaving((l) => {
          const n = new Set(l);
          n.delete(s.id);
          return n;
        });
        setArmed((a) => {
          const n = new Set(a);
          n.delete(s.id);
          return n;
        });
      }, wait);
    });
  }

  /** step-tab tick: arm for 3 s, then fade the row out and stamp it; a second tap before that undoes the tick */
  function tick(s: Staff, action: VestAction) {
    if (leaving.has(s.id)) return;
    if (armed.has(s.id)) {
      disarm(s.id);
      return;
    }
    setArmed((a) => new Set(a).add(s.id));
    const t = window.setTimeout(() => {
      timers.current.delete(s.id);
      leave(s, action);
    }, TICK_DELAY_MS);
    timers.current.set(s.id, t);
  }

  /** Com o tio → undo the delivery: the person goes back to "sem colete" and leaves this tab */
  function undo(s: Staff) {
    if (leaving.has(s.id)) return;
    disarm(s.id);
    leave(s, "undo-deliver");
  }

  const crumbs = checkinHomePath ? <Breadcrumbs items={[{ label: tx("Check-in"), onClick: () => navigate(checkinHomePath) }, { label: tx("Coletes") }]} /> : null;

  if (!staff) {
    return (
      <div className="admin-page">
        {crumbs}
        <p className="opt-empty">{tx("Sincronizando com o servidor… 🏕️")}</p>
      </div>
    );
  }

  const total = active.length;
  const pct = total ? Math.round((counts.back / total) * 100) : 0;

  /** the phone is never in the record: read from IPAlpha only when the helper taps it */
  function contactOf(s: Staff) {
    return <PersonContact token={token} personId={s.id} name={s.name} compact />;
  }

  function rowClass(s: Staff, step: Step, extra = "") {
    const late = step === "out" && windowOver;
    const reviewing = s.aiReviewStatus === "pending" || s.aiReviewStatus === "processing" || s.aiReviewStatus === "structured";
    return `bus-row vest-row vest-row--${step} ${late ? "vest-row--late" : ""} ${reviewing ? "camper-ai-review" : ""} ${extra}`;
  }

  /** "Todos" layout: status icon · name + phone · action buttons */
  function fullRow(s: Staff) {
    const step = stepOf(s);
    const busy = pending.has(s.id);
    return (
      <li key={s.id} className={rowClass(s, step)}>
        <StepIcon step={step} sex={staffSex(s, bedrooms)} />
        <span className="bus-row__body">
          <span className="bus-row__name">
            <span className={`strike ${step === "back" ? "strike--on" : ""}`}>{s.name || "…"}</span>
          </span>
          <span className="bus-row__meta">
            {contactOf(s)}
            {step === "out" && s.vest.delivered && <>{tx(" · entregue {when}", { when: speakStamp(s.vest.delivered.at) })}</>}
            {step === "back" && s.vest.returned && <>{tx(" · devolvido {when}", { when: speakStamp(s.vest.returned.at) })}</>}
          </span>
        </span>
        <span className="vest-row__actions">
          {step === "pending" && (
            <button type="button" className="button button--secondary vest-row__btn" disabled={busy} onClick={() => void run(s, "deliver")}>
              {tx("Entreguei")}
            </button>
          )}
          {step === "out" && (
            <>
              <button type="button" className="button button--primary vest-row__btn" disabled={busy} onClick={() => void run(s, "return")}>
                {tx("Já me devolveu")}
              </button>
              <button type="button" className="icon-btn" title={tx("Desfazer entrega")} aria-label={tx("Desfazer entrega de {name}", { name: s.name })} disabled={busy} onClick={() => void run(s, "undo-deliver")}>
                <UndoGlyph />
              </button>
            </>
          )}
          {step === "back" && (
            <button type="button" className="icon-btn" title={tx("Desfazer devolução")} aria-label={tx("Desfazer devolução de {name}", { name: s.name })} disabled={busy} onClick={() => void run(s, "undo-return")}>
              <UndoGlyph />
            </button>
          )}
        </span>
      </li>
    );
  }

  /** step-tab layout: tick box · name + phone · status icon (already showing the next state while ticked) */
  function tickRow(s: Staff, tabKey: Exclude<Tab, "all">) {
    const step = TAB_STEP[tabKey];
    const first = s.name.split(" ")[0] || "…";
    const on = armed.has(s.id) || leaving.has(s.id);
    const going = leaving.has(s.id);
    const action: VestAction = tabKey === "deliver" ? "deliver" : "return";
    const label = on ? tx("Desfazer: {name}", { name: first }) : tabKey === "deliver" ? tx("{name} recebeu o colete", { name: first }) : tx("{name} devolveu o colete", { name: first });
    return (
      <li key={s.id} className={rowClass(s, step, `vest-row--tab ${on ? "vest-row--ticked" : ""} ${going ? "vest-row--leaving" : ""}`)}>
        <button
          type="button"
          className={`bus-row__check vest-row__tap ${on ? "bus-row__check--on" : ""}`}
          title={label}
          aria-label={label}
          aria-pressed={on}
          disabled={going}
          onClick={() => tick(s, action)}
        >
          {on && <CheckGlyph size="1.2em" />}
        </button>
        <span className="bus-row__body">
          <span className="bus-row__name">
            <span className={`strike ${on ? "strike--on" : ""}`}>{s.name || "…"}</span>
          </span>
          <span className="bus-row__meta">{contactOf(s)}</span>
        </span>
        <span className={`vest-row__swap ${on ? "vest-row__swap--next" : ""}`}>
          <StepIcon step={step} sex={staffSex(s, bedrooms)} className="vest-row__swap-now" />
          <StepIcon step={tabKey === "deliver" ? "out" : "back"} sex={staffSex(s, bedrooms)} className="vest-row__swap-then" />
        </span>
        {tabKey === "return" && (
          <button type="button" className="icon-btn vest-row__undo" title={tx("Desfazer entrega")} aria-label={tx("Desfazer entrega de {name}", { name: s.name })} disabled={going} onClick={() => undo(s)}>
            <UndoGlyph />
          </button>
        )}
      </li>
    );
  }

  return (
    <div className="admin-page">
      {crumbs}
      <header className="admin-head">
        <h1 className="admin-title">{tx("🦺 Coletes da equipe")}</h1>
        <span className="checkin-progress" title={tx("Coletes já devolvidos")}>
          ✅ {counts.back}/{total}
        </span>
      </header>
      <p className="admin-intro">{tx("Entregue o colete no início e recolha no fim.")}</p>

      <div className="vehicle__progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={counts.back} aria-label={tx("Coletes devolvidos")}>
        <span className="vehicle__bar" aria-hidden="true">
          <span className="vehicle__bar-fill" style={{ width: `${pct}%` }} />
        </span>
        <span className="vehicle__pct">{pct}%</span>
      </div>

      {error && <p className="message message--error">{error}</p>}

      <div className="cat-tabs" role="tablist" aria-label={tx("Filtrar por situação")}>
        {TABS.map((t) => {
          const on = filter === t.key;
          return (
            <button key={t.key} type="button" role="tab" aria-selected={on} className={`cat-tab ${on ? "cat-tab--active" : ""}`} onClick={() => setTab(t.key)}>
              <span className="cat-tab__emoji" aria-hidden="true">
                {t.icon}
              </span>{" "}
              {t.label}
              <span className="cat-tab__count">{t.key === "all" ? total : t.key === "deliver" ? counts.pending : counts.out}</span>
            </button>
          );
        })}
      </div>

      <SearchField placeholder={tx("Buscar pelo nome…")} value={search} onChange={setSearch} aria-label={tx("Buscar pelo nome")} />

      {total === 0 && <p className="opt-empty">{tx("Ninguém na equipe ainda.")}</p>}
      {total > 0 && main.length === 0 && others.length === 0 && (
        <p className="opt-empty">
          {search ? tx("Nenhum resultado. 🔍") : filter === "deliver" ? tx("Todo mundo já está de colete. 🦺") : filter === "return" ? tx("Nenhum colete com a equipe. ✅") : tx("Nenhum resultado. 🔍")}
        </p>
      )}

      <ul className="bus-list">
        {main.map((s) => (filter === "all" ? fullRow(s) : tickRow(s, filter)))}
        {others.length > 0 && (
          <li className="vest-divider" role="separator">
            {tx("Outros")}
          </li>
        )}
        {others.map(fullRow)}
      </ul>
    </div>
  );
}


function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
