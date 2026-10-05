import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckGlyph, UndoGlyph } from "../components/Glyph";
import SearchField from "../components/SearchField";
import { checkinStaff, undoCheckinStaff, type Staff } from "../api/staff";
import { useConfirm } from "../components/ConfirmDialog";
import Breadcrumbs from "../components/Breadcrumbs";
import { ICONS } from "../icons";
import { useRoute } from "../router";
import { useCollection, useCollectionOrEmpty } from "../store";
import { collatorLocale, useI18n } from "../i18n";
import { speakTime } from "../dates";
import { useNames } from "../store/people";
import styles from "../styles/ops.module.scss";

interface StaffCheckinPageProps {
  token: string;
  /** merged admin Check-in landing page */
  checkinHomePath?: string;
}

/** a tick stays "armed" this long before it is stamped — a second tap in the meantime undoes it */
const TICK_DELAY_MS = 3000;
/** matches the `bus-row--leaving` animation */
const LEAVE_MS = 650;

/** Departure day roll call for the team: name + one tap to mark as arrived. */
export default function StaffCheckinPage({ token, checkinHomePath }: StaffCheckinPageProps) {
  const { tx, te } = useI18n();
  const staff = useCollection("staff");
  const transports = useCollectionOrEmpty("transports");
  const busIds = useMemo(() => new Set(transports.filter((t) => t.kind === "bus").map((t) => t.id)), [transports]);
  const onBus = (s: Staff) => !!s.transportation && busIds.has(s.transportation);
  const { navigate } = useRoute();
  const confirm = useConfirm();
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<Set<string>>(new Set());
  /** ticked, waiting for the delay before the check-in is stamped */
  const [armed, setArmed] = useState<Set<string>>(new Set());
  /** fading out of the "still to arrive" group */
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const timers = useRef<Map<string, number>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const people = useMemo(() => {
    if (!staff) return [];
    const q = normalize(search);
    return staff
      .filter((s) => s.active && onBus(s))
      .filter((s) => !q || normalize(s.name).includes(q))
      // who still has to arrive first, then the ones already here — alphabetical within each;
      // a row fading out keeps its place until the animation is over
      .sort((a, b) => Number(!!a.checkin && !leaving.has(a.id)) - Number(!!b.checkin && !leaving.has(b.id)) || a.name.localeCompare(b.name, collatorLocale(), { sensitivity: "base" }));
  }, [staff, search, leaving, busIds]);

  /** who stamped each arrival (person ids — names read live) */
  const nameOf = useNames(people.map((s) => s.checkin?.byPersonId));

  const counts = useMemo(() => {
    const active = staff?.filter((s) => s.active && onBus(s)) ?? [];
    return { total: active.length, arrived: active.filter((s) => s.checkin).length };
  }, [staff, busIds]);

  const disarm = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t !== undefined) window.clearTimeout(t);
    timers.current.delete(id);
    setArmed((a) => {
      if (!a.has(id)) return a;
      const n = new Set(a);
      n.delete(id);
      return n;
    });
  }, []);

  // unmount drops every tick still waiting
  useEffect(() => {
    return () => {
      for (const id of Array.from(timers.current.keys())) disarm(id);
    };
  }, [disarm]);

  async function run(s: Staff, undo: boolean) {
    if (pending.has(s.id)) return false;
    setPending((p) => new Set(p).add(s.id));
    setError(null);
    try {
      if (undo) await undoCheckinStaff(token, s.id);
      else await checkinStaff(token, s.id);
      return true;
    } catch (e) {
      setError(te(e, "Algo deu errado."));
      return false;
    } finally {
      setPending((p) => {
        const n = new Set(p);
        n.delete(s.id);
        return n;
      });
    }
  }

  /** fade the row out of the "to arrive" group while the check-in is stamped; it shows up again among the arrived */
  function leave(s: Staff) {
    setLeaving((l) => new Set(l).add(s.id));
    const started = Date.now();
    void run(s, false).then((ok) => {
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

  /** tick: arm for 3 s, then fade the row out and stamp it; a second tap before that undoes the tick */
  function tick(s: Staff) {
    if (leaving.has(s.id)) return;
    if (armed.has(s.id)) {
      disarm(s.id);
      return;
    }
    setArmed((a) => new Set(a).add(s.id));
    const t = window.setTimeout(() => {
      timers.current.delete(s.id);
      leave(s);
    }, TICK_DELAY_MS);
    timers.current.set(s.id, t);
  }

  async function toggle(s: Staff) {
    if (pending.has(s.id) || leaving.has(s.id)) return;
    if (!s.checkin) {
      tick(s);
      return;
    }
    if (!(await confirm({ emoji: <UndoGlyph />, title: tx("Desfazer o check-in de {name}?", { name: s.name.split(" ")[0] || "…" }), confirmLabel: tx("Desfazer"), danger: true }))) return;
    void run(s, true);
  }

  if (!staff) {
    return (
      <div className="admin-page">
        {checkinHomePath && <Breadcrumbs items={[{ label: tx("Check-in"), onClick: () => navigate(checkinHomePath) }, { label: tx("Equipe") }]} />}
        <p className="opt-empty">{tx("Sincronizando com o servidor… 🏕️")}</p>
      </div>
    );
  }

  const pct = counts.total ? Math.round((counts.arrived / counts.total) * 100) : 0;

  return (
    <div className="admin-page">
      {checkinHomePath && <Breadcrumbs items={[{ label: tx("Check-in"), onClick: () => navigate(checkinHomePath) }, { label: tx("Equipe") }]} />}
      <header className="admin-head">
        <h1 className="admin-title detail-title">
          <img className={`audience-icon ${styles.headIcon}`} src={ICONS.staff} alt="" aria-hidden="true" />
          {tx("Check-in da equipe")}
        </h1>
        <span className="checkin-progress" title={tx("Pessoas da equipe que já chegaram")}>
          ✅ {counts.arrived}/{counts.total}
        </span>
      </header>

      <div className="vehicle__progress" role="progressbar" aria-valuemin={0} aria-valuemax={counts.total} aria-valuenow={counts.arrived} aria-label={tx("Equipe que chegou")}>
        <span className="vehicle__bar" aria-hidden="true">
          <span className="vehicle__bar-fill" style={{ width: `${pct}%` }} />
        </span>
        <span className="vehicle__pct">{pct}%</span>
      </div>

      {error && <p className="message message--error">{error}</p>}

      <SearchField placeholder={tx("Buscar pelo nome…")} value={search} onChange={setSearch} aria-label={tx("Buscar pelo nome")} />

      {counts.total === 0 && <p className="opt-empty">{tx("Ninguém na equipe ainda.")}</p>}
      {counts.total > 0 && people.length === 0 && <p className="opt-empty">{tx("Nenhum resultado. 🔍")}</p>}

      <ul className="bus-list">
        {people.map((s) => {
          const going = leaving.has(s.id);
          const on = !!s.checkin || armed.has(s.id) || going;
          const busy = pending.has(s.id) && !going;
          const first = s.name.split(" ")[0] || "…";
          const by = s.checkin && s.checkin.byPersonId !== s.id ? nameOf(s.checkin.byPersonId).split(" ")[0] : "";
          const label = s.checkin ? tx("Desfazer o check-in de {name}", { name: first }) : on ? tx("Desfazer: {name}", { name: first }) : tx("{name} chegou", { name: first });
          return (
            <li key={s.id} className={`${going ? "bus-item--leaving" : ""}`}>
              <button
                type="button"
                className={`bus-row bus-row--roll ${on ? "bus-row--on" : ""}`}
                disabled={busy}
                aria-pressed={on}
                aria-label={label}
                title={label}
                onClick={() => void toggle(s)}
              >
                <span className={`bus-row__check ${on ? "bus-row__check--on" : ""}`} aria-hidden="true">
                  {on && <CheckGlyph size="1.2em" />}
                </span>
                <span className="bus-row__body">
                  <span className="bus-row__name">
                    <span className={`strike ${on ? "strike--on" : ""}`}>{s.name || "…"}</span>
                  </span>
                  {s.checkin && (
                    <span className="bus-row__meta">
                      {tx("chegou às {time}", { time: speakTime(s.checkin.at) })}
                      {by && ` · ${tx("com {name}", { name: by })}`}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
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
