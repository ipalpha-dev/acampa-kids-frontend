import { useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import Dialog from "../../components/Dialog";
import DesktopBoardNotice from "../../components/DesktopBoardNotice";
import RoomRoleIcon from "../../components/RoomRoleIcon";
import Toggle from "../../components/Toggle";
import { useConfirm } from "../../components/ConfirmDialog";
import BusLogo from "../../components/BusLogo";
import CarLogo from "../../components/CarLogo";
import { updateCamper, type Camper } from "../../api/campers";
import { staffSex, updateStaff, type Staff } from "../../api/staff";
import { BEDROOM_GROUPS, GROUP_META, type Bedroom, type BedroomGroup } from "../../api/bedrooms";
import { createTransport, deleteTransport, updateTransport, type Transport, type TransportInput } from "../../api/transports";
import TransportForm from "./TransportForm";
import { useCollection, useCollectionOrEmpty } from "../../store";
import { ICONS } from "../../icons";
import { collatorLocale, useI18n } from "../../i18n";
import { compareByName, firstNameOf, shownName } from "./staffNames";

/** which side of the board the filter is focused on */
type ScopeFilter = "all" | "campers" | "staff";

interface BusAssignPageProps {
  token: string;
}

/** What a carried drag holds: one líder's crew of kids, or a staff member. */
interface DragUnit {
  kind: "kids" | "staff";
  ids: string[];
  /** vehicle the unit currently sits on (null = the left board) */
  from: string | null;
}

/** One líder's kids — the unit that travels to a bus in a single drag. */
interface Crew {
  key: string;
  lead: Staff | null;
  members: Camper[];
}

/** names come live from IPAlpha ("…" while one is on its way) */
const firstName = firstNameOf;

/** saving-set key for a staff member ("s:" so it never collides with a camper id) */
const staffKey = (id: string) => `s:${id}`;

/**
 * Crew colours (mirrors Montar quartos): each líder of a room gets one, so a
 * crew is recognisable on the bus cards too.
 */
const CREW_COLORS = ["green", "blue", "pink", "violet"] as const;
type CrewColor = (typeof CREW_COLORS)[number];
const COLORS_BY_WING: Record<BedroomGroup, readonly CrewColor[]> = {
  girls: ["pink", "blue", "violet", "green"],
  boys: ["green", "blue", "pink", "violet"],
  staff: ["green", "blue", "pink", "violet"],
};

/**
 * Admin: "Ônibus" — the vehicle fleet (create / edit / delete the buses and
 * cars) plus the allocation board: the kids, grouped per líder inside their
 * rooms on the left, dragged onto a bus on the right. The líder is only the
 * group's label — they do NOT travel with the kids: each staff member goes on
 * a bus in their own right, from the Equipe section. Dragging anything back to
 * the left takes it off the vehicle.
 */
export default function BusAssignPage({ token }: BusAssignPageProps) {
  const { tx } = useI18n();
  const storedBedrooms = useCollection("bedrooms");
  const storedTransports = useCollection("transports");
  const campers = useCollectionOrEmpty("campers");
  const staff = useCollectionOrEmpty("staff");
  const confirm = useConfirm();

  const [dragUnit, setDragUnit] = useState<DragUnit | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  /** the vehicle form dialog: null = closed */
  const [vehicleForm, setVehicleForm] = useState<{ kind: "create" } | { kind: "edit"; transport: Transport } | null>(null);
  const [vehicleBusy, setVehicleBusy] = useState(false);
  /** board focus: everything, just the campers, or just the team */
  const [scope, setScope] = useState<ScopeFilter>("all");
  const showCampers = scope !== "staff";
  const showTeam = scope !== "campers";
  /** false = hide the líder chips, only the campers show */
  const [showStaff, setShowStaff] = useState(true);

  const bedrooms = useMemo(() => (storedBedrooms ? sortRooms(storedBedrooms) : null), [storedBedrooms]);
  const vehicles = useMemo(() => (storedTransports ? storedTransports.slice().sort((a, b) => a.order - b.order) : null), [storedTransports]);
  const kids = useMemo(() => campers.slice().sort(compareByName), [campers]);

  const vehicleIds = useMemo(() => new Set(vehicles?.map((v) => v.id) ?? []), [vehicles]);
  /** a transportation id that matches no vehicle (deleted) counts as "sem ônibus" */
  const isPlaced = (k: Camper) => !!k.transportation && vehicleIds.has(k.transportation);
  const waitingAll = kids.filter((k) => !isPlaced(k));
  const placedCount = kids.length - waitingAll.length;
  /** the team travels too — one by one, never dragged along by their crew */
  const team = staff.filter((s) => s.active).sort(compareByName);
  const teamWaiting = team.filter((s) => !(s.transportation && vehicleIds.has(s.transportation)));

  // ── who looks after whom ──

  /** the líderes of a room, in a stable order (their colour index) */
  function caretakersOf(roomId: string): Staff[] {
    return staff.filter((s) => s.bedroom === roomId && s.roomRole === "caretaker").sort(compareByName);
  }

  /** a crew's colour: their líder's colour in the room (null = no líder) */
  function crewColor(kid: Camper): CrewColor | null {
    if (!kid.caretakerId || !kid.bedroom) return null;
    const room = bedrooms?.find((b) => b.id === kid.bedroom);
    if (!room) return null;
    const i = caretakersOf(room.id).findIndex((s) => s.id === kid.caretakerId);
    if (i < 0) return null;
    return COLORS_BY_WING[room.group][i % COLORS_BY_WING[room.group].length];
  }

  /** kids grouped per líder (same room); kids without a líder come back alone */
  function crewsOf(list: Camper[]): Crew[] {
    const byLead = new Map<string, Crew>();
    for (const k of list) {
      const key = k.caretakerId ?? `kid:${k.id}`;
      if (!byLead.has(key)) byLead.set(key, { key, lead: k.caretakerId ? staff.find((s) => s.id === k.caretakerId) ?? null : null, members: [] });
      byLead.get(key)!.members.push(k);
    }
    return [...byLead.values()].sort((a, b) => compareByName({ name: a.lead?.name ?? a.members[0].name }, { name: b.lead?.name ?? b.members[0].name }));
  }

  // ── drag & drop (pointer events: mouse AND touch) ──

  /** a vehicle is always a valid drop; the left board takes units coming FROM a vehicle — and staff any time, so a mixed selection can always be taken off */
  function canDrop(unit: DragUnit, target: string): boolean {
    if (saving.size > 0) return false;
    if (target.startsWith("bus:")) return vehicles?.some((v) => v.id === target.slice(4)) ?? false;
    return unit.kind === "staff" || unit.from !== null; // room / pool: take them off the bus
  }

  async function drop(unit: DragUnit, target: string) {
    if (!canDrop(unit, target)) return;
    await setBus(unit, target.startsWith("bus:") ? target.slice(4) : null);
  }

  /** moves everyone in the unit onto a vehicle (null = off): kids by crew, staff one by one */
  async function setBus(unit: DragUnit, busId: string | null) {
    if (unit.kind === "staff") {
      const moving = unit.ids
        .map((id) => staff.find((s) => s.id === id))
        .filter((s): s is Staff => !!s && s.transportation !== busId);
      if (!moving.length) return;
      setError(null);
      setSaving((prev) => new Set([...prev, ...moving.map((s) => staffKey(s.id))]));
      try {
        for (const s of moving) await updateStaff(token, s.id, { transportation: busId });
      } catch (e) {
        setError(e instanceof Error ? e.message : tx("Algo deu errado."));
      } finally {
        setSaving((prev) => {
          const next = new Set(prev);
          for (const s of moving) next.delete(staffKey(s.id));
          return next;
        });
      }
      return;
    }
    const moving = unit.ids.map((id) => kids.find((k) => k.id === id)).filter((k): k is Camper => !!k && k.transportation !== busId);
    if (!moving.length) return;
    setError(null);
    setSaving((prev) => new Set([...prev, ...moving.map((k) => k.id)]));
    try {
      for (const k of moving) await updateCamper(token, k.id, { transportation: busId });
    } catch (e) {
      setError(e instanceof Error ? e.message : tx("Algo deu errado."));
    } finally {
      setSaving((prev) => {
        const next = new Set(prev);
        for (const k of moving) next.delete(k.id);
        return next;
      });
    }
  }

  function beginDrag(
    e: React.PointerEvent,
    unit: DragUnit,
    onTap?: () => void,
    onDropped?: () => void,
  ) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const startX = e.clientX;
    const startY = e.clientY;
    let active = false;

    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", end);
      setDragUnit(null);
      setGhost(null);
      setHover(null);
    };
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      if (!active) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 8) return;
        active = true;
        setDragUnit(unit);
      }
      setGhost({ x: ev.clientX, y: ev.clientY });
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest("[data-assign-drop]");
      const t = el?.getAttribute("data-assign-drop") ?? null;
      setHover((prev) => (prev === t ? prev : t));
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      const target = active
        ? document.elementFromPoint(ev.clientX, ev.clientY)?.closest("[data-assign-drop]")?.getAttribute("data-assign-drop") ?? null
        : null;
      end();
      if (target) {
        void drop(unit, target);
        onDropped?.();
      } else if (!active) {
        onTap?.(); // a press that never moved is a tap, not a drag
      }
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", end);
  }

  // ── staff selection, Finder-style: rubber band on the background, taps toggle,
  //    then dragging any selected chip carries the whole selection ──

  /** the staff chips currently selected (kept across drags, like a Finder selection) */
  const [pickedStaff, setPickedStaff] = useState<Set<string>>(new Set());
  /** the rubber band in flight (viewport coordinates) */
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  function toggleStaff(id: string) {
    setPickedStaff((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** every staff chip whose box the rubber band touches — plus whichever the pointer is hovering */
  function staffInRect(x0: number, y0: number, x1: number, y1: number): Set<string> {
    const [left, right] = [Math.min(x0, x1), Math.max(x0, x1)];
    [y0, y1] = [Math.min(y0, y1), Math.max(y0, y1)];
    const hits = new Set<string>();
    for (const el of document.querySelectorAll<HTMLElement>("[data-bus-staff]")) {
      const r = el.getBoundingClientRect();
      if (r.left <= right && r.right >= left && r.top <= y1 && r.bottom >= y0) hits.add(el.getAttribute("data-bus-staff")!);
    }
    // the chip under the pointer counts even while the band is still tiny
    const under = document.elementFromPoint(x1, y1)?.closest("[data-bus-staff]");
    if (under) hits.add(under.getAttribute("data-bus-staff")!);
    return hits;
  }

  /** pointer down on the board background: rubber band (mouse) / tap clears the selection */
  function boardPointerDown(e: React.PointerEvent) {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    const target = e.target as HTMLElement;
    // chips, crew cards and controls run their own gestures — only bare background selects
    if (target.closest("[data-bus-staff]") || target.closest(".bus-crew") || target.closest("button") || target.closest("input") || target.closest("label")) return;
    // the gesture is ours: without this the browser starts a native text selection,
    // which swallows the pointer moves (Safari cancels them outright)
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    let active = false;

    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", end);
      setMarquee(null);
    };
    const move = (ev: PointerEvent) => {
      if (!active) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
        active = true;
      }
      setMarquee({ x0: startX, y0: startY, x1: ev.clientX, y1: ev.clientY });
      setPickedStaff(staffInRect(startX, startY, ev.clientX, ev.clientY));
    };
    const up = () => {
      const wasActive = active;
      end();
      // a plain click on the background drops the selection (Finder)
      if (!wasActive) setPickedStaff(new Set());
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", end);
  }

  /** press on a staff chip: tap toggles the selection, drag carries it (the whole selection when the chip is selected) */
  function beginStaffDrag(e: React.PointerEvent, s: Staff, from: string | null) {
    const selected = pickedStaff.has(s.id);
    const ids = selected ? [...pickedStaff] : [s.id];
    beginDrag(
      e,
      { kind: "staff", ids, from },
      () => toggleStaff(s.id),
      () => setPickedStaff(new Set()),
    );
  }

  // ── the fleet (create / edit / delete) ──

  async function handleVehicleSubmit(input: TransportInput) {
    if (!vehicleForm) return;
    setVehicleBusy(true);
    try {
      if (vehicleForm.kind === "create") await createTransport(token, input);
      else await updateTransport(token, vehicleForm.transport.id, input);
      setVehicleForm(null);
    } finally {
      setVehicleBusy(false);
    }
  }

  async function handleDeleteVehicle(v: Transport) {
    const aboard = kids.filter((k) => k.transportation === v.id).length;
    if (
      !(await confirm({
        emoji: "🗑️",
        title: tx('Excluir "{label}"?', { label: v.label }),
        message:
          aboard > 0
            ? aboard === 1
              ? tx("{n} criança fica sem ônibus. Isso não pode ser desfeito.", { n: aboard })
              : tx("{n} crianças ficam sem ônibus. Isso não pode ser desfeito.", { n: aboard })
            : tx("Isso não pode ser desfeito."),
        confirmLabel: tx("Excluir"),
        danger: true,
      }))
    )
      return;
    await deleteTransport(token, v.id).catch((e) => setError(e instanceof Error ? e.message : tx("Algo deu errado.")));
  }

  if (!bedrooms || !vehicles) {
    return (
      <div className="admin-page">
        <p className="opt-empty">{tx("Sincronizando com o servidor… 🏕️")}</p>
      </div>
    );
  }

  const hoverValid = hover && dragUnit ? canDrop(dragUnit, hover) : false;
  const dropState = (target: string) =>
    hover === target && dragUnit ? (hoverValid ? " over" : " bad") : "";
  const poolKids = waitingAll.filter((k) => !k.bedroom);

  return (
    <div className="admin-page" onPointerDown={boardPointerDown}>
      <DesktopBoardNotice what={tx("alocar os ônibus")} icon={ICONS.desktopBetterBus} />
      <header className="admin-head">
        <h1 className="admin-title">
          <img className="admin-title__icon" src={ICONS.transport} alt="" aria-hidden="true" /> {tx("Ônibus")}
        </h1>
        <div className="admin-head__actions">
          <button type="button" className="button button--primary admin-head__new" disabled={!!dragUnit || vehicleBusy} onClick={() => setVehicleForm({ kind: "create" })}>
            {tx("+ Novo")}
          </button>
        </div>
      </header>

      {error && <p className="message message--error">{error}</p>}
      {waitingAll.length > 0 ? (
        <p className="message message--warn">
          {waitingAll.length === 1
            ? tx("⚠️ {n} criança ainda sem ônibus.", { n: waitingAll.length })
            : tx("⚠️ {n} crianças ainda sem ônibus.", { n: waitingAll.length })}
        </p>
      ) : (
        kids.length > 0 && <p className="message message--ok">{tx("Todas as crianças têm ônibus. 🎉")}</p>
      )}

      <p className="admin-intro">
        {vehicles.length} {vehicles.length === 1 ? tx("veículo") : tx("veículos")} · <strong>{placedCount}</strong> {tx("de {n} crianças alocadas", { n: kids.length })}
      </p>

      <div className="assign-toolbar" role="group" aria-label={tx("Filtros")}>
        {(
          [
            { key: "all" as const, label: tx("Todos"), icon: null as string | null, count: waitingAll.length + teamWaiting.length },
            { key: "campers" as const, label: tx("Crianças"), icon: ICONS.camper, count: waitingAll.length },
            { key: "staff" as const, label: tx("Equipe"), icon: GROUP_META.staff.icon ?? null, count: teamWaiting.length },
          ] satisfies { key: ScopeFilter; label: string; icon: string | null; count: number }[]
        ).map((f) => (
          <button
            key={f.key}
            type="button"
            className={`chip-toggle chip-toggle--small ${scope === f.key ? "chip-toggle--on" : ""}`}
            aria-pressed={scope === f.key}
            onClick={() => setScope(f.key)}
          >
            {f.icon && <img className="chip-toggle__icon" src={f.icon} alt="" aria-hidden="true" />}
            {f.label}
            <span className="cat-tab__count">{f.count}</span>
          </button>
        ))}
        <Toggle checked={showStaff} onChange={setShowStaff} label={tx("Mostrar os líderes")} />
      </div>

      <div className="assign-layout">
        {/* ── left: the rooms, kids grouped per líder, waiting for a bus ── */}
        <section className={`assign-pool${dropState("pool")}`} data-assign-drop="pool">
          {waitingAll.length === 0 && teamWaiting.length === 0 && <p className="opt-empty">{tx("Todo mundo tem ônibus. 🎉")}</p>}

          {showCampers && poolKids.length > 0 && (
            <div className="bus-wing">
              <h3 className="bus-wing__title">{tx("Sem quarto")}</h3>
              <div className="bus-room__chips">
                {crewsOf(poolKids).map((crew) => (
                  <CrewCard key={crew.key} crew={crew} saving={saving} colorOf={crewColor} bedrooms={bedrooms} showLead={showStaff} onBeginDrag={(e) => beginDrag(e, { kind: "kids", ids: crew.members.map((k) => k.id), from: null })} onBeginKidDrag={(e, k) => beginDrag(e, { kind: "kids", ids: [k.id], from: null })} />
                ))}
              </div>
            </div>
          )}

          {showCampers &&
            BEDROOM_GROUPS.flatMap((g) =>
              // only rooms still waiting for a bus come up: a room whose kids are
              // all aboard is already done, so it leaves the board
              bedrooms.filter((b) => b.group === g && waitingAll.some((k) => k.bedroom === b.id)),
            ).map((b) => {
              const inRoom = waitingAll.filter((k) => k.bedroom === b.id);
            return (
              <div key={b.id} className={`bus-room${dropState(`room:${b.id}`)}`} data-assign-drop={`room:${b.id}`}>
                <span className="bus-room__name">{b.name}</span>
                <div className="bus-room__chips">
                  {crewsOf(inRoom).map((crew) => (
                    <CrewCard key={crew.key} crew={crew} saving={saving} colorOf={crewColor} bedrooms={bedrooms} showLead={showStaff} onBeginDrag={(e) => beginDrag(e, { kind: "kids", ids: crew.members.map((k) => k.id), from: null })} onBeginKidDrag={(e, k) => beginDrag(e, { kind: "kids", ids: [k.id], from: null })} />
                  ))}
                </div>
              </div>
            );
          })}

          {/* the team goes on the buses too — as staff, each one on their own */}
          {showTeam && teamWaiting.length > 0 && (
            <div className="bus-wing">
              <h3 className="bus-wing__title room-group__title--green">
                <img className="bus-wing__icon" src={GROUP_META.staff.icon} alt="" aria-hidden="true" /> {tx("Equipe")}
              </h3>
              <div className="bus-room__chips">
                {teamWaiting.map((s) => (
                  <StaffChip key={s.id} staff={s} saving={saving.has(staffKey(s.id))} picked={pickedStaff.has(s.id)} bedrooms={bedrooms} onBeginDrag={(e) => beginStaffDrag(e, s, null)} />
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ── right: the fleet — drop a líder's crew to put them on the bus ── */}
        <div className="bus-fleet">
          {vehicles.length === 0 ? (
            <div className="admin-empty">
              <img className="admin-empty__img" src={ICONS.transport} alt="" aria-hidden="true" />
              <p>
                {tx("Cadastre cada")} <strong>{tx("ônibus")}</strong> {tx("(com sua cor e número) e cada")} <strong>{tx("carro")}</strong> {tx("que traz as crianças ao acampamento.")}
              </p>
              <button type="button" className="button button--primary" onClick={() => setVehicleForm({ kind: "create" })}>
                {tx("+ Criar o primeiro")}
              </button>
            </div>
          ) : (
            <div className="bus-fleet-grid">
              {vehicles.map((v) => {
                const aboardAll = kids.filter((k) => k.transportation === v.id);
                const aboard = showCampers ? aboardAll : [];
                const staffAboardAll = team.filter((s) => s.transportation === v.id);
                const staffAboard = showTeam ? staffAboardAll : [];
                const over = v.capacity != null && aboardAll.length > v.capacity;
                return (
                  <div
                    key={v.id}
                    className={`bus-card${v.kind === "bus" ? " bus-card--bus" : ""}${dropState(`bus:${v.id}`)}`}
                    data-assign-drop={`bus:${v.id}`}
                    style={v.kind === "bus" ? ({ "--bus": v.color ?? "#0f9a8a" } as CSSProperties) : undefined}
                  >
                    {/* the bus body seen from above — front is the top; wheels on both axles */}
                    {v.kind === "bus" && (
                      <>
                        <span className="bus-card__wheel bus-card__wheel--fl" aria-hidden="true" />
                        <span className="bus-card__wheel bus-card__wheel--fr" aria-hidden="true" />
                        <span className="bus-card__wheel bus-card__wheel--rl" aria-hidden="true" />
                        <span className="bus-card__wheel bus-card__wheel--rr" aria-hidden="true" />
                        {/* headlights + wing mirrors at the front, tail lamps + exhaust at the rear */}
                        <span className="bus-card__lamp bus-card__lamp--l" aria-hidden="true" />
                        <span className="bus-card__lamp bus-card__lamp--r" aria-hidden="true" />
                        <span className="bus-card__mirror bus-card__mirror--l" aria-hidden="true" />
                        <span className="bus-card__mirror bus-card__mirror--r" aria-hidden="true" />
                        <span className="bus-card__tail bus-card__tail--l" aria-hidden="true" />
                        <span className="bus-card__tail bus-card__tail--r" aria-hidden="true" />
                        <span className="bus-card__pipe" aria-hidden="true" />
                        {/* the passenger door on the right, swung open outward */}
                        <span className="bus-card__door" aria-hidden="true" />
                      </>
                    )}
                    <header className="bus-card__head">
                      {v.kind === "bus" ? <BusLogo color={v.color ?? "#0f9a8a"} number={v.number} size={44} /> : <CarLogo size={44} />}
                      <div className="bus-card__body">
                        <span className="bus-card__name">{v.label}</span>
                        <span className={`bus-card__seats${over ? " bus-card__seats--over" : ""}`}>
                          {v.capacity != null
                            ? v.capacity === 1
                              ? tx("{n} de {capacity} lugar", { n: aboardAll.length, capacity: v.capacity })
                              : tx("{n} de {capacity} lugares", { n: aboardAll.length, capacity: v.capacity })
                            : <>{aboardAll.length} {aboardAll.length === 1 ? tx("pessoa") : tx("pessoas")}</>}
                          {over ? tx(" · lotado") : ""}
                        </span>
                      </div>
                      <div className="bus-card__tools">
                        <button type="button" className="icon-btn icon-btn--bare" title={tx("Editar transporte")} disabled={vehicleBusy} onClick={() => setVehicleForm({ kind: "edit", transport: v })}>
                          <span className="pencil" aria-hidden="true">✏️</span>
                        </button>
                        <button type="button" className="icon-btn icon-btn--bare icon-btn--danger" title={tx("Excluir transporte")} disabled={vehicleBusy} onClick={() => handleDeleteVehicle(v)}>
                          🗑️
                        </button>
                      </div>
                    </header>
                    {aboardAll.length === 0 && staffAboardAll.length === 0 ? (
                      <p className="bus-card__empty">{tx("Arraste a turma de um líder para cá.")}</p>
                    ) : (
                      <>
                        {/* the team rides in the front of the bus — its own section, set apart by spacing */}
                        {staffAboard.length > 0 && (
                          <div className="bus-card__chips bus-card__chips--front">
                            {staffAboard.map((s) => (
                              <StaffChip key={s.id} staff={s} saving={saving.has(staffKey(s.id))} picked={pickedStaff.has(s.id)} bedrooms={bedrooms} onBeginDrag={(e) => beginStaffDrag(e, s, v.id)} />
                            ))}
                          </div>
                        )}
                        {aboard.length > 0 && (
                          <div className="bus-card__chips">
                            {crewsOf(aboard).map((crew) => (
                              <CrewCard
                                key={crew.key}
                                crew={crew}
                                saving={saving}
                                colorOf={crewColor}
                                bedrooms={bedrooms}
                                showLead={false}
                                onBeginDrag={(e) => beginDrag(e, { kind: "kids", ids: crew.members.map((k) => k.id), from: v.id })}
                                onBeginKidDrag={(e, k) => beginDrag(e, { kind: "kids", ids: [k.id], from: v.id })}
                              />
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* What the finger carries: the grabbed kid over the board, the whole crew over a bus. */}
      {dragUnit && ghost && createPortal(
        (() => {
          const overBus = !!hover?.startsWith("bus:");
          // a staff carry is an explicit multi-selection: show everything it holds;
          // a kid still on the board shows just the grabbed chip until it reaches a bus
          const carried = dragUnit.kind === "staff" || overBus || dragUnit.from !== null ? dragUnit.ids : dragUnit.ids.slice(0, 1);
          return (
            <div className="assign-ghost" style={{ left: ghost.x, top: ghost.y }} aria-hidden="true">
              {carried.slice(0, 3).map((id) => {
                if (dragUnit.kind === "staff") {
                  const s = staff.find((x) => x.id === id);
                  if (!s) return null;
                  return (
                    <span key={id} className="assign-chip assign-chip--staff">
                      <RoomRoleIcon role={s.roomRole} size={16} sex={staffSex(s, bedrooms)} />
                      {firstName(s.name)}
                    </span>
                  );
                }
                const k = kids.find((c) => c.id === id);
                if (!k) return null;
                return <span key={id} className="assign-chip">{firstName(k.name)}</span>;
              })}
              {carried.length > 3 && <span className="assign-chip">+{carried.length - 3}</span>}
            </div>
          );
        })(),
        document.body,
      )}

      {/* the rubber band while it is drawn (viewport coordinates) */}
      {marquee &&
        createPortal(
          <div
            className="bus-marquee"
            style={{
              left: Math.min(marquee.x0, marquee.x1),
              top: Math.min(marquee.y0, marquee.y1),
              width: Math.abs(marquee.x1 - marquee.x0),
              height: Math.abs(marquee.y1 - marquee.y0),
            }}
            aria-hidden="true"
          />,
          document.body,
        )}

      {/* create / edit a vehicle — the same form the transporte section used */}
      <Dialog
        open={!!vehicleForm}
        onClose={() => setVehicleForm(null)}
        title={vehicleForm?.kind === "edit" ? tx("Editar transporte") : tx("Novo transporte")}
        width={560}
      >
        {vehicleForm && (
          <TransportForm
            key={vehicleForm.kind === "edit" ? vehicleForm.transport.id : "new"}
            transport={vehicleForm.kind === "edit" ? vehicleForm.transport : undefined}
            busy={vehicleBusy}
            onSubmit={handleVehicleSubmit}
            onCancel={() => setVehicleForm(null)}
          />
        )}
      </Dialog>
    </div>
  );
}

// ── chips ──

/**
 * One líder's crew as a draggable card: the kids as chips, the líder's name in
 * the top-right corner as the group's label (they do NOT travel with the kids —
 * on the buses only the kids show). Kids without a líder render as plain chips.
 */
function CrewCard({
  crew,
  saving,
  colorOf,
  bedrooms,
  showLead,
  onBeginDrag,
  onBeginKidDrag,
}: {
  crew: Crew;
  saving: Set<string>;
  colorOf: (kid: Camper) => CrewColor | null;
  bedrooms: Bedroom[];
  /** false = only the campers show (the líder label hides) */
  showLead: boolean;
  onBeginDrag: (e: React.PointerEvent) => void;
  /** grab a single kid by their own chip — e.g. one child riding in a parent's car */
  onBeginKidDrag: (e: React.PointerEvent, kid: Camper) => void;
}) {
  const { tx } = useI18n();
  const busy = crew.members.some((k) => saving.has(k.id));
  // all members share the líder, so the first kid's colour is the crew's
  const color = colorOf(crew.members[0]);
  const lead = showLead ? crew.lead : null;
  return (
    <div
      className={`bus-crew${lead ? "" : " bus-crew--nolead"}${busy ? " bus-crew--saving" : ""}`}
      onPointerDown={onBeginDrag}
      role="button"
      tabIndex={0}
      aria-label={crewLabel(crew, tx)}
    >
      {lead && (
        <span className="bus-crew__lead">
          <RoomRoleIcon role="caretaker" size={14} sex={staffSex(lead, bedrooms)} />
          {firstName(lead.name)}
        </span>
      )}
      {crew.members.map((k) => (
        <span
          key={k.id}
          className={`assign-chip${color ? ` assign-chip--${color}` : ""}${saving.has(k.id) ? " assign-chip--saving" : ""}`}
          onPointerDown={(e) => {
            // grabbing a kid's own chip carries just that child (they ride the
            // bus or a parent's car on their own), not the líder's whole crew —
            // stop the card's handler from also starting a crew drag
            e.stopPropagation();
            onBeginKidDrag(e, k);
          }}
        >
          {firstName(k.name)}
        </span>
      ))}
    </div>
  );
}

/** One team member — travels on a bus in their own right; a staff drag sweeps
 *  over other staff chips to collect them into the same carry. */
function StaffChip({
  staff: s,
  saving,
  picked,
  bedrooms,
  onBeginDrag,
}: {
  staff: Staff;
  saving: boolean;
  /** already collected into the staff drag in flight */
  picked?: boolean;
  bedrooms: Bedroom[];
  onBeginDrag: (e: React.PointerEvent) => void;
}) {
  return (
    <span
      data-bus-staff={s.id}
      className={`assign-chip assign-chip--staff${saving ? " assign-chip--saving" : ""}${picked ? " assign-chip--picked" : ""}`}
      onPointerDown={onBeginDrag}
      aria-label={shownName(s.name)}
    >
      <RoomRoleIcon role={s.roomRole} size={16} sex={staffSex(s, bedrooms)} />
      {firstName(s.name)}
    </span>
  );
}

function crewLabel(crew: Crew, tx: (pt: string, vars?: Record<string, string | number>) => string): string {
  const who = crew.members.map((k) => firstName(k.name)).join(", ");
  return crew.lead ? tx("Turma de {name}: {who}", { name: firstName(crew.lead.name), who }) : who;
}

function sortRooms(list: Bedroom[]): Bedroom[] {
  return list.slice().sort((a, b) => a.name.localeCompare(b.name, collatorLocale(), { numeric: true }));
}
