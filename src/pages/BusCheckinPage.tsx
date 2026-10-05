import { useMemo, useState } from "react";
import BedroomTag from "../components/BedroomTag";
import { ageOf, checkinCamper, undoCheckinCamper, type Camper } from "../api/campers";
import { useConfirm } from "../components/ConfirmDialog";
import Breadcrumbs from "../components/Breadcrumbs";
import QrScannerDialog from "../components/QrScannerDialog";
import ScanFab from "../components/ScanFab";
import BusLogo from "../components/BusLogo";
import HealthHeart from "../components/HealthHeart";
import CarLogo from "../components/CarLogo";
import TeamTag from "../components/TeamTag";
import TransportTag from "../components/TransportTag";
import { transportShortLabel } from "../api/transports";
import { camperIdFromQr } from "../print/camperLabels";
import { useRoute } from "../router";
import { otherTrip } from "../hooks/useDefaultBusTrip";
import { useCollection, useCollectionOrEmpty } from "../store";
import { useLabelOf } from "../store/derive";
import { UndoGlyph } from "../components/Glyph";
import SearchField from "../components/SearchField";
import { ICONS } from "../icons";
import { collatorLocale, useI18n } from "../i18n";

interface BusCheckinPageProps {
  token: string;
  /** a bus HELPER works the door of the ONE vehicle the admin linked them to: skip the picker and lock to it */
  onlyVehicleId?: string;
  /** medical team: browse every vehicle and who is (not yet) on board, but never tap a kid */
  readOnly?: boolean;
  /** route root; admins use /checkin/bus while helpers keep /bus */
  basePath?: string;
  /** which trip this roll call records */
  trip?: "outbound" | "return";
  /** when set, adds the merged Check-in landing page to the breadcrumb */
  checkinHomePath?: string;
  /** may this person open the OTHER journey? (helpers only see the trips whose window is open) */
  otherTripAvailable?: boolean;
  /** admins: route of the per-vehicle report (Por veículo). Absent = no button (helpers / medical) */
  reportPath?: string;
}

/**
 * Roll call at the vehicle door: one list of every kid, tap to board. Admins
 * / organizers see everyone (chips filter by vehicle when there is more than
 * one). A bus helper is locked to the ONE vehicle the admin linked them to
 * (Settings → Check-in) — no filter, they stand at its door. Read-only for
 * the medical team (same screens, nothing to tap).
 */
export default function BusCheckinPage({ token, onlyVehicleId, readOnly = false, basePath = "/bus", trip = "outbound", checkinHomePath, otherTripAvailable = true, reportPath }: BusCheckinPageProps) {
  const { tx } = useI18n();
  const campers = useCollection("campers");
  const bedrooms = useCollectionOrEmpty("bedrooms");
  const transports = useCollectionOrEmpty("transports");
  const labelOf = useLabelOf();
  const confirm = useConfirm();
  const { navigate } = useRoute();
  const tripListPath = basePath.endsWith("/outbound") || basePath.endsWith("/return") ? basePath.replace(/\/(outbound|return)$/, "") : basePath;
  const [search, setSearch] = useState("");
  /** admin / organizer: which vehicle the list is narrowed to — null = every kid */
  const [vehicleFilter, setVehicleFilter] = useState<string | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  // the door works by QR: the camera opens as soon as there is a vehicle to check in; close it to search by name
  const [scannerOpen, setScannerOpen] = useState(!readOnly);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanNotice, setScanNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const checkinKind = trip === "return" ? "bus_return" : "bus";
  const tripTitle = trip === "return" ? tx("Volta") : tx("Ida");
  const tripShort = trip === "return" ? tx("volta") : tx("ida");
  /** the app lands on the journey that is happening now; this jumps to the other one when the guess is wrong */
  const swapTitle = trip === "return" ? tx("Ir para o check-in da ida para o acampamento") : tx("Ir para o check-in da volta para a igreja");
  const swap = otherTripAvailable ? (
    <button
      type="button"
      className="button button--secondary trip-swap"
      title={swapTitle}
      aria-label={swapTitle}
      onClick={() => navigate(`${tripListPath}/${otherTrip(trip)}`)}
    >
      <span className="trip-swap__arrow" aria-hidden="true">→</span>
      <span className="trip-swap__icon" aria-hidden="true">{trip === "return" ? "🏕️" : "⛪"}</span>
      <span className="admin-head__action-label">{trip === "return" ? tx("Ida") : tx("Volta")}</span>
    </button>
  ) : null;
  /** the same report the church check-in opens: chegadas por veículo (admins only) */
  const report = reportPath ? (
    <button type="button" className="button button--secondary admin-head__new" title={tx("Chegadas por veículo")} aria-label={tx("Chegadas por veículo")} onClick={() => navigate(reportPath)}>
      <img className="admin-head__action-icon" src={ICONS.report} alt="" aria-hidden="true" />
      <span className="admin-head__action-label">{tx("Por veículo")}</span>
    </button>
  ) : null;

  const roomById = useMemo(() => new Map(bedrooms.map((b) => [b.id, b])), [bedrooms]);
  const vehicles = useMemo(() => transports.slice().sort((a, b) => a.order - b.order), [transports]);
  const lockedVehicle = onlyVehicleId ? vehicles.find((o) => o.id === onlyVehicleId) ?? null : null;
  /** chips only when an admin/organizer (or medical) can see more than one vehicle */
  const showVehicleFilter = onlyVehicleId === undefined && vehicles.length > 1;
  const activeVehicleId = onlyVehicleId ?? vehicleFilter;

  const roster = useMemo(() => {
    if (!campers) return [];
    return campers.filter((k) => {
      if (!k.transportation) return false;
      if (onlyVehicleId) return k.transportation === onlyVehicleId;
      return vehicles.some((v) => v.id === k.transportation);
    });
  }, [campers, onlyVehicleId, vehicles]);

  /** kids per vehicle (for the chips) */
  const countIn = useMemo(() => {
    const m = new Map<string, { total: number; boarded: number }>();
    for (const k of roster) {
      if (!k.transportation) continue;
      const c = m.get(k.transportation) ?? { total: 0, boarded: 0 };
      c.total++;
      if (trip === "return" ? k.busReturnCheckin : k.busCheckin) c.boarded++;
      m.set(k.transportation, c);
    }
    return m;
  }, [roster, trip]);

  const kids = useMemo(() => {
    const q = normalize(search);
    return roster
      .filter((k) => !activeVehicleId || k.transportation === activeVehicleId)
      .filter((k) => !q || normalize(k.name).includes(q))
      // 1) ready to board  2) already on the bus  3) locked by a missing prerequisite
      .sort((a, b) => rank(a, trip) - rank(b, trip) || a.name.localeCompare(b.name, collatorLocale(), { sensitivity: "base" }));
  }, [roster, activeVehicleId, search, trip]);

  const scoped = activeVehicleId ? roster.filter((k) => k.transportation === activeVehicleId) : roster;
  const counts = {
    total: scoped.length,
    boarded: scoped.filter((k) => (trip === "return" ? k.busReturnCheckin : k.busCheckin)).length,
  };

  async function toggle(k: Camper) {
    if (readOnly || pending.has(k.id)) return;
    const on = trip === "return" ? !!k.busReturnCheckin : !!k.busCheckin;
    const prerequisite = trip === "return" ? !!k.busCheckin : !!k.checkin;
    if (!on && !prerequisite) return;
    if (on && !(await confirm({ emoji: <UndoGlyph />, title: tx("Tirar {name} do ônibus?", { name: k.name.split(" ")[0] }), message: tx("A criança voltará para a lista da {trip}.", { trip: tripShort }), confirmLabel: tx("Tirar"), danger: true }))) return;
    setPending((p) => new Set(p).add(k.id));
    setError(null);
    try {
      if (on) await undoCheckinCamper(token, k.id, checkinKind);
      else await checkinCamper(token, k.id, checkinKind);
    } catch (e) {
      setError(e instanceof Error ? e.message : tx("Algo deu errado."));
    } finally {
      setPending((p) => {
        const n = new Set(p);
        n.delete(k.id);
        return n;
      });
    }
  }

  async function scanQr(raw: string) {
    if (!campers || scanBusy) return;
    setScanBusy(true);
    setScanNotice(null);
    try {
      const id = camperIdFromQr(raw);
      if (!id) throw new Error(tx("Este QR code não é de uma pulseira ou crachá do Acampa Kids."));
      const camper = campers.find((k) => k.id === id);
      if (!camper) throw new Error(tx("Esta criança não está disponível para o seu check-in."));
      if (onlyVehicleId && camper.transportation !== onlyVehicleId) {
        const assigned = labelOf(camper.transportation);
        throw new Error(assigned ? tx("{name} não está neste veículo — está em {vehicle}.", { name: camper.name, vehicle: assigned }) : tx("{name} não está neste veículo.", { name: camper.name }));
      }
      if (!onlyVehicleId && (!camper.transportation || !vehicles.some((v) => v.id === camper.transportation))) {
        throw new Error(tx("{name} não tem transporte cadastrado.", { name: camper.name }));
      }
      const already = trip === "return" ? camper.busReturnCheckin : camper.busCheckin;
      if (already) throw new Error(tx("{name} já fez o check-in da {trip}.", { name: camper.name, trip: tripShort }));
      if (trip === "return" && !camper.busCheckin) throw new Error(tx("{name} não fez o check-in do ônibus na ida.", { name: camper.name }));
      if (trip === "outbound" && !camper.checkin) throw new Error(tx("{name} ainda não fez check-in na igreja.", { name: camper.name }));

      await checkinCamper(token, camper.id, checkinKind);
      setScannerOpen(false);
      setScanNotice({ kind: "ok", text: tx("✅ {name} entrou no ônibus da {trip}.", { name: camper.name || "…", trip: tripShort }) });
    } catch (e) {
      setScannerOpen(false);
      setScanNotice({ kind: "error", text: e instanceof Error ? e.message : tx("Não foi possível ler este QR code.") });
    } finally {
      setScanBusy(false);
    }
  }

  if (!campers) {
    return (
      <div className="admin-page">
        {checkinHomePath && <Breadcrumbs items={[{ label: tx("Check-in"), onClick: () => navigate(checkinHomePath) }, { label: tx("Ônibus") }]} />}
        <p className="opt-empty">{tx("Sincronizando com o servidor… 🏕️")}</p>
      </div>
    );
  }

  // a bus helper linked to a vehicle that no longer exists / was deactivated
  if (onlyVehicleId !== undefined && !lockedVehicle) {
    return (
      <div className="admin-page">
        <header className="admin-head">
          <h1 className="admin-title">
            <img className="admin-title__icon" src={ICONS.transport} alt="" aria-hidden="true" />
            {tripTitle}
          </h1>
        </header>
        <p className="opt-empty">
          {tx("O veículo que você ficaria na porta não existe mais.")}
          <br />
          {tx("Fale com a organização para ajustar.")}
        </p>
      </div>
    );
  }

  const pct = counts.total ? Math.round((counts.boarded / counts.total) * 100) : 0;
  const titleVehicle = lockedVehicle;

  return (
    <div className="admin-page">
      {checkinHomePath && (
        <Breadcrumbs items={[{ label: tx("Check-in"), onClick: () => navigate(checkinHomePath) }, { label: tx("Ônibus") }]} />
      )}
      <header className="admin-head">
        <h1 className={`admin-title${titleVehicle ? " admin-title--with-logo" : ""}`}>
          {titleVehicle ? (
            titleVehicle.kind === "bus" ? <BusLogo color={titleVehicle.color ?? "#0f9a8a"} number={titleVehicle.number} size={30} /> : <CarLogo size={30} />
          ) : (
            <img className="admin-title__icon" src={ICONS.transport} alt="" aria-hidden="true" />
          )}
          {titleVehicle ? `${titleVehicle.label} · ${tripTitle}` : (readOnly ? tripTitle : tx("Check-in: {trip}", { trip: tripTitle }))}
        </h1>
        {(report || swap) && <div className="admin-head__actions bus-head__actions">{report}{swap}</div>}
      </header>

      <div className="vehicle__progress" role="progressbar" aria-valuemin={0} aria-valuemax={counts.total} aria-valuenow={counts.boarded} aria-label={tx("Crianças que embarcaram")}>
        <span className="vehicle__count" title={tx("Crianças que já embarcaram")}>{counts.boarded}/{counts.total}</span>
        <span className="vehicle__bar" aria-hidden="true">
          <span className="vehicle__bar-fill" style={{ width: `${pct}%` }} />
        </span>
        <span className="vehicle__pct">{pct}%</span>
      </div>

      {error && <p className="message message--error">{error}</p>}
      {scanNotice && <p className={`message message--${scanNotice.kind}`}>{scanNotice.text}</p>}
      {readOnly && <p className="admin-intro">{tx("🔍 Só consulta — a chamada é feita pela organização e pelos ajudantes do ônibus.")}</p>}

      {showVehicleFilter && (
        <div className="health-filter" role="group" aria-label={tx("Veículo")}>
          <button
            type="button"
            className={`chip-toggle chip-toggle--small ${vehicleFilter === null ? "chip-toggle--on" : ""}`}
            aria-pressed={vehicleFilter === null}
            onClick={() => setVehicleFilter(null)}
          >
            {tx("Todos")}
            <span className="cat-tab__count">{roster.length}</span>
          </button>
          {vehicles.map((o) => {
            const c = countIn.get(o.id) ?? { total: 0, boarded: 0 };
            const on = vehicleFilter === o.id;
            return (
              <button
                key={o.id}
                type="button"
                className={`chip-toggle chip-toggle--small ${on ? "chip-toggle--on" : ""}`}
                aria-pressed={on}
                onClick={() => setVehicleFilter(on ? null : o.id)}
              >
                {o.kind === "bus" ? <BusLogo color={o.color ?? "#0f9a8a"} number={o.number} size={22} /> : <CarLogo size={22} />}
                {transportShortLabel(o)}
                <span className="cat-tab__count">{c.boarded}/{c.total}</span>
              </button>
            );
          })}
        </div>
      )}

      <SearchField placeholder={tx("Buscar pelo nome…")} value={search} onChange={setSearch} aria-label={tx("Buscar pelo nome")} />

      {roster.length === 0 && <p className="opt-empty">{vehicles.length === 0 ? tx("Nenhum transporte cadastrado.") : onlyVehicleId ? tx("Nenhuma criança neste veículo.") : tx("Nenhuma criança com transporte cadastrado.")}</p>}
      {roster.length > 0 && kids.length === 0 && <p className="opt-empty">{tx("Nenhum resultado. 🔍")}</p>}

      <ul className="bus-list">
        {kids.map((k) => {
          const on = trip === "return" ? !!k.busReturnCheckin : !!k.busCheckin;
          const prerequisite = trip === "return" ? !!k.busCheckin : !!k.checkin;
          const locked = !on && !prerequisite;
          const busy = pending.has(k.id);
          const room = k.bedroom ? roomById.get(k.bedroom) : null;
          const age = ageOf(k.birthDate ?? null);
          return (
            <li key={k.id}>
              <button
                type="button"
                className={`bus-row ${on ? "bus-row--on" : ""} ${locked ? "bus-row--locked" : ""} ${readOnly ? "bus-row--readonly" : ""}`}
                disabled={busy || locked || readOnly}
                aria-pressed={on}
                title={readOnly ? undefined : locked ? tx("Precisa fazer o check-in na igreja primeiro") : undefined}
                onClick={() => toggle(k)}
              >
                <span className={`bus-row__check ${on ? "bus-row__check--on" : ""}`} aria-hidden="true">
                  {on ? "✓" : locked ? "🔒" : ""}
                </span>
                <span className="bus-row__body">
                  <span className="bus-row__name">
                    <span className={`strike ${on ? "strike--on" : ""}`}>{k.name || "…"}</span>
                    <HealthHeart show={k.hasHealth} />
                    {age !== null && <span className="kid-card__age">{tx("{age} anos", { age })}</span>}
                  </span>
                  <span className="bus-row__meta">
                    {onlyVehicleId === undefined && k.transportation && (
                      <>
                        <TransportTag transportId={k.transportation} short className="staff-tag--inline" />
                        {" · "}
                      </>
                    )}
                    {room ? <BedroomTag bedroom={room} className="staff-tag--inline" /> : tx("sem quarto")}
                    {k.team && (
                      <span className="bus-row__team">
                        {" · "}
                        <TeamTag teamId={k.team} className="staff-tag--inline" />
                      </span>
                    )}
                    {locked && <span className="staff-card__missing"> · {trip === "return" ? tx("não embarcou na ida") : tx("sem check-in na igreja")}</span>}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {!readOnly && (
        <ScanFab
          label={tx("Ler a pulseira ou o crachá")}
          onClick={() => {
            setScanNotice(null);
            setScannerOpen(true);
          }}
        />
      )}
      <QrScannerDialog open={scannerOpen} busy={scanBusy} onScan={scanQr} onClose={() => setScannerOpen(false)} />
    </div>
  );
}

function rank(k: Camper, trip: "outbound" | "return"): number {
  const on = trip === "return" ? k.busReturnCheckin : k.busCheckin;
  const prerequisite = trip === "return" ? k.busCheckin : k.checkin;
  if (on) return 1;
  return prerequisite ? 0 : 2;
}

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
