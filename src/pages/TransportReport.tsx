import { useMemo, useState } from "react";
import BedroomTag from "../components/BedroomTag";
import { ageOf, type Camper } from "../api/campers";
import { type Staff } from "../api/staff";
import Breadcrumbs from "../components/Breadcrumbs";
import CamperIcon from "../components/CamperIcon";
import StaffIcon from "../components/StaffIcon";
import BusLogo from "../components/BusLogo";
import OpsFamilyContact from "../components/OpsFamilyContact";
import { useCollection, useCollectionOrEmpty } from "../store";
import { speakTime } from "../dates";
import { ICONS } from "../icons";
import { useDefaultBusTrip } from "../hooks/useDefaultBusTrip";
import { collatorLocale, useI18n } from "../i18n";

interface TransportReportProps {
  onBack: () => void;
  /** merged admin check-in landing page, when this report is nested below Igreja */
  onHome?: () => void;
  /** when set, staff tags navigate to the person (admins only — the staff pages are theirs) */
  onOpenStaff?: (staffId: string) => void;
  /** when set, kid names navigate to the kid */
  onOpenCamper?: (camperId: string) => void;
  /** which check-in opened this report — only changes the middle breadcrumb */
  via?: "church" | "bus";
}

/**
 * Which leg of the BUS journey the report is showing. Each one reads its OWN
 * stamp on the kid, so the numbers always answer "who is on the bus RIGHT
 * NOW, on this trip":
 *
 *   ida   → `busCheckin`        boarded the bus to the camp
 *   volta → `busReturnCheckin`  boarded the bus back to the church
 *
 * The church door (`Camper.checkin`) is NOT a leg here: it is its own roll
 * call (pages/CheckinPage), and this report is about the vehicles.
 */
type Leg = "outbound" | "return";

const LEGS: Leg[] = ["outbound", "return"];

/** Below this share of boarded kids the vehicle only shows its progress bar — the list is still too long to be useful. */
const SHOW_LIST_AT = 0.8;

interface Vehicle {
  id: string;
  label: string;
  color: string | null;
  number: string | null;
  kids: Camper[];
  arrived: Camper[];
  missing: Camper[];
  staff: Staff[];
}

/**
 * Per BUS, for ONE leg of the journey (see `Leg`): progress bar of the kids
 * already stamped, the missing ones once most of them are there, and the staff
 * riding in it. The leg is switchable in the header — the same vehicles serve
 * the trip out AND the trip home, so the report follows the whole journey, not
 * only the church door. It opens on the leg that is happening now
 * (`useDefaultBusTrip`, plus the church window).
 *
 * Only buses are listed: a car is just a family dropping their own kid off.
 */
export default function TransportReport({ onBack, onHome, onOpenStaff, onOpenCamper, via = "church" }: TransportReportProps) {
  const { tx } = useI18n();
  const campers = useCollection("campers");
  const staff = useCollectionOrEmpty("staff");
  const transports = useCollectionOrEmpty("transports");
  const bedrooms = useCollectionOrEmpty("bedrooms");
  /** the leg being shown; starts on the trip happening now, then the user owns it */
  const defaultTrip = useDefaultBusTrip();
  const [leg, setLeg] = useState<Leg | null>(null);
  const shownLeg: Leg = leg ?? (defaultTrip === "return" ? "return" : "outbound");
  const stamp = (k: Camper) => (shownLeg === "return" ? k.busReturnCheckin : k.busCheckin);
  const legLabel = shownLeg === "return" ? tx("Volta") : tx("Ida");
  const legLabelLower = shownLeg === "return" ? tx("volta") : tx("ida");
  /** vehicles where the user asked to see everyone, not only the missing */
  const [showAll, setShowAll] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const roomById = useMemo(() => new Map(bedrooms.map((b) => [b.id, b])), [bedrooms]);

  const vehicles = useMemo<Vehicle[]>(() => {
    const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name, collatorLocale(), { sensitivity: "base" });
    const kidsIn = new Map<string, Camper[]>();
    const staffIn = new Map<string, Staff[]>();
    for (const k of campers ?? []) if (k.transportation) (kidsIn.get(k.transportation) ?? kidsIn.set(k.transportation, []).get(k.transportation)!).push(k);
    for (const s of staff) if (s.active && s.transportation) (staffIn.get(s.transportation) ?? staffIn.set(s.transportation, []).get(s.transportation)!).push(s);

    // buses only: cars are families dropping their own kid off, not a roll call
    return transports
      .filter((t) => t.kind === "bus")
      .sort((a, b) => a.order - b.order)
      .map((v) => {
        const kids = (kidsIn.get(v.id) ?? []).sort(byName);
        return {
          id: v.id,
          label: v.label,
          color: v.color ?? null,
          number: v.number ?? null,
          kids,
          arrived: kids.filter((k) => stamp(k)),
          missing: kids.filter((k) => !stamp(k)),
          staff: (staffIn.get(v.id) ?? []).sort(byName),
        };
      });
  }, [campers, staff, transports, shownLeg]);

  /** the header total counts the kids ON THE BUSES — the only ones this report is about */
  const totals = useMemo(() => {
    const kids = vehicles.flatMap((v) => v.kids);
    return { kids: kids.length, arrived: kids.filter((k) => stamp(k)).length };
  }, [vehicles, shownLeg]);

  const none = useMemo(
    () => ({ kids: (campers ?? []).filter((k) => !k.transportation), staff: staff.filter((s) => s.active && !s.transportation) }),
    [campers, staff],
  );

  function toggleAll(id: string) {
    setShowAll((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const crumbs = onHome
    ? [{ label: tx("Check-in"), onClick: onHome }, { label: via === "bus" ? tx("Ônibus") : tx("Igreja"), onClick: onBack }, { label: tx("Por veículo") }]
    : [{ label: tx("Check-in"), onClick: onBack }, { label: tx("Por veículo") }];

  if (!campers) {
    return (
      <div className="admin-page">
        <Breadcrumbs items={crumbs} />
        <p className="opt-empty">{tx("Sincronizando com o servidor… 🏕️")}</p>
      </div>
    );
  }



  return (
    <div className="admin-page">
      <Breadcrumbs items={crumbs} />
      <header className="admin-head">
        <h1 className="admin-title">
          <img className="admin-title__icon" src={ICONS.report} alt="" aria-hidden="true" />
          {tx("Por veículo")}
        </h1>
        <span className="checkin-progress" title={tx("Crianças de ônibus que já embarcaram — {leg}", { leg: legLabel })}>
          ✅ {totals.arrived}/{totals.kids}
        </span>
      </header>

      {/* which leg of the journey: the same buses take the kids there AND back */}
      <div className="health-filter" role="tablist" aria-label={tx("Trecho da viagem")}>
        {LEGS.map((key) => {
          const label = key === "outbound" ? tx("Ida") : tx("Volta");
          const emoji = key === "outbound" ? "🏕️" : "⛪";
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={shownLeg === key}
              className={`chip-toggle chip-toggle--small ${shownLeg === key ? "chip-toggle--on" : ""}`}
              title={key === "outbound" ? tx("Embarque para o acampamento") : tx("Embarque de volta para a igreja")}
              onClick={() => setLeg(key)}
            >
              <span aria-hidden="true">{emoji}</span> {label}
            </button>
          );
        })}
      </div>

      {error && <p className="message message--error">{error}</p>}
      {vehicles.length === 0 && <p className="opt-empty">{tx("Nenhum ônibus cadastrado.")}</p>}

      {vehicles.map((v) => {
        const pct = v.kids.length ? v.arrived.length / v.kids.length : 1;
        const complete = v.kids.length > 0 && v.missing.length === 0;
        const canList = v.kids.length > 0 && pct >= SHOW_LIST_AT;
        const all = showAll.has(v.id);
        const listed = all ? v.kids : v.missing;
        return (
          <section key={v.id} className={`vehicle ${complete ? "vehicle--complete" : ""}`}>
            <header className="vehicle__head">
              <h2 className="vehicle__title">
                {complete && <span aria-hidden="true">✅ </span>}
                <BusLogo color={v.color ?? "#0f9a8a"} number={v.number} size={26} />
                {v.label}
              </h2>
              <span className="vehicle__counts">
                <span title={tx("equipe")}>
                  <StaffIcon size={16} /> {v.staff.length}
                </span>
                <span title={tx("crianças")}>
                  <CamperIcon size={16} /> {v.kids.length}
                </span>
              </span>
            </header>

            {v.kids.length > 0 ? (
              <div className="vehicle__progress" role="progressbar" aria-valuemin={0} aria-valuemax={v.kids.length} aria-valuenow={v.arrived.length} aria-label={tx("Crianças que já embarcaram em {vehicle}", { vehicle: v.label })}>
                <span className="vehicle__bar" aria-hidden="true">
                  <span className="vehicle__bar-fill" style={{ width: `${Math.round(pct * 100)}%` }} />
                </span>
                <span className="vehicle__pct">
                  <strong>{v.arrived.length}</strong>/{v.kids.length} {tx("crianças")} · {Math.round(pct * 100)}%
                </span>
              </div>
            ) : (
              <p className="vehicle__hint">{tx("Nenhuma criança neste veículo.")}</p>
            )}

            {canList && (
              <div className="vehicle__kids">
                <div className="vehicle__subhead">
                  <h3 className="vehicle__h3">
                    <CamperIcon size={18} /> {all ? tx("Todas as crianças") : complete ? tx("Todas embarcaram! 🎉") : tx("Faltam {n}", { n: v.missing.length })}
                  </h3>
                  {!complete && (
                    <button type="button" className="staff-tag staff-tag--link staff-tag--soft" onClick={() => toggleAll(v.id)}>
                      {all ? tx("Só quem falta") : tx("Mostrar todos")}
                    </button>
                  )}
                </div>
                {listed.length > 0 && (
                  <ul className="vehicle__list">
                    {listed.map((k) => {
                      const room = k.bedroom ? roomById.get(k.bedroom) : null;
                      const age = ageOf(k.birthDate ?? null);
                      const done = stamp(k);
                      return (
                        <li key={k.id} className={`vehicle__person ${done ? "vehicle__person--ok" : ""}`} title={done ? tx("Embarcou às {time}", { time: speakTime(done.at) }) : undefined}>
                          <span className="vehicle__person-name">
                            {/* the "only missing" list needs no marker; "show all" tells boarded from missing */}
                            {(done || all) && <span aria-hidden="true">{done ? "✅" : "⏳"}</span>}
                            {onOpenCamper ? (
                              <button type="button" className="link-btn" onClick={() => onOpenCamper(k.id)}>
                                {k.name || "…"}
                              </button>
                            ) : (
                              k.name || "…"
                            )}
                            {age !== null && <span className="kid-card__age">{tx("{age} anos", { age })}</span>}
                          </span>
                          <span className="vehicle__person-meta">
                            {room ? <BedroomTag bedroom={room} className="staff-tag--inline" /> : tx("sem quarto")}
                            {!done && !k.redacted && <OpsFamilyContact camperId={k.id} kidName={k.name} />}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            <div className="vehicle__staff">
              <h3 className="vehicle__h3">
                <StaffIcon size={18} /> {tx("Equipe")}{" "}
                {/* a staff record carries ONE stamp (the church arrival), never a per-trip one — so here they are only listed, not counted as boarded */}
                <span className="cat-tab__count">{v.staff.length}</span>
              </h3>
              {v.staff.length === 0 ? (
                <p className="vehicle__hint vehicle__hint--warn">{tx("⚠️ Nenhum adulto neste veículo.")}</p>
              ) : (
                <div className="staff-card__tags">
                  {v.staff.map((s) => {
                    const hint = tx("Vai neste veículo na {leg}{phone}", { leg: legLabelLower, phone: "" });
                    return onOpenStaff ? (
                      <button key={s.id} type="button" className="staff-tag staff-tag--link" title={tx("{hint} — ver {name}", { hint, name: s.name || "…" })} onClick={() => onOpenStaff(s.id)}>
                        {s.name || "…"} ›
                      </button>
                    ) : (
                      <span key={s.id} className="staff-tag" title={hint}>
                        {s.name || "…"}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        );
      })}

      {(none.kids.length > 0 || none.staff.length > 0) && (
        <section className="vehicle vehicle--none">
          <header className="vehicle__head">
            <h2 className="vehicle__title">{tx("⚠️ Sem transporte")}</h2>
            <span className="vehicle__counts">
              <span title={tx("equipe")}>
                <StaffIcon size={16} /> {none.staff.length}
              </span>
              <span title={tx("crianças")}>
                <CamperIcon size={16} /> {none.kids.length}
              </span>
            </span>
          </header>
          <ul className="vehicle__list">
            {none.kids.map((k) => (
              <li key={k.id} className={`vehicle__person ${stamp(k) ? "vehicle__person--ok" : ""}`}>
                <span className="vehicle__person-name">
                  <CamperIcon size={16} /> {k.name || "…"}
                </span>
              </li>
            ))}
            {none.staff.map((s) => (
              <li key={s.id} className="vehicle__person">
                <span className="vehicle__person-name">
                  <StaffIcon size={16} /> {s.name || "…"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
