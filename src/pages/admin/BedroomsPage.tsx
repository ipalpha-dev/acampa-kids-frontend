import { useConfirm } from "../../components/ConfirmDialog";
import { useMemo, useState } from "react";
import BunkIcon from "../../components/BunkIcon";
import {
  BEDROOM_GROUPS,
  GROUP_META,
  createBedroom,
  deleteBedroom,
  updateBedroom,
  type Bedroom,
  type BedroomGroup,
  type BedroomInput,
} from "../../api/bedrooms";
import type { Camper } from "../../api/campers";
import { compareRoomStaff, staffSex, type Staff } from "../../api/staff";
import GroupIcon from "../../components/GroupIcon";
import KidIcon from "../../components/KidIcon";
import RoomRoleIcon from "../../components/RoomRoleIcon";
import StaffIcon from "../../components/StaffIcon";
import Breadcrumbs from "../../components/Breadcrumbs";
import BedroomForm from "./BedroomForm";
import DetailStack from "./DetailStack";
import { useRoute } from "../../router";
import { useCollection, useCollectionOrEmpty } from "../../store";
import { useLabelOf } from "../../store/derive";
import { downloadBedroomsXlsx } from "../../export";
import { DownloadGlyph } from "../../components/Glyph";
import { ICONS, kidSexOf } from "../../icons";
import { collatorLocale, useI18n } from "../../i18n";
import { shortPersonName } from "../../names";
import { compareByName, NAME_PENDING, shownName } from "./staffNames";

interface BedroomsPageProps {
  token: string;
  /** medical team: see every room and who sleeps there, but no create / edit / delete / Excel */
  readOnly?: boolean;
}

/** URL → what to show:  /bedrooms · /bedrooms/new?group=girls · /bedrooms/:id · /bedrooms/:id/edit */
type Mode = { kind: "view" } | { kind: "create"; group?: BedroomGroup } | { kind: "edit"; id: string } | { kind: "detail"; id: string };
function modeOf(segments: string[], params: URLSearchParams): Mode {
  const [, id, action] = segments;
  if (!id || id === "assign") return { kind: "view" };
  if (id === "new") {
    const g = params.get("group");
    return { kind: "create", group: (BEDROOM_GROUPS as readonly string[]).includes(g ?? "") ? (g as BedroomGroup) : undefined };
  }
  if (action === "edit") return { kind: "edit", id };
  return { kind: "detail", id };
}

/** Admin: bedrooms grouped by wing, each with its bed layout and occupancy; read-only for the medical team. */
export default function BedroomsPage({ token, readOnly = false }: BedroomsPageProps) {
  const { tx, te } = useI18n();
  // from the local store (localStorage + live WebSocket feed) — occupancy is kept fresh by the server push
  const stored = useCollection("bedrooms");
  const bedrooms = useMemo(() => (stored ? sortRooms(stored) : null), [stored]);
  const campers = useCollectionOrEmpty("campers");
  const staff = useCollectionOrEmpty("staff");
  const occupants = useMemo(() => occupantsByRoom(campers, staff), [campers, staff]);
  const [staffOnly, setStaffOnly] = useState(false);
  const listed = useMemo(
    () => (!bedrooms ? [] : staffOnly ? bedrooms.filter((b) => (occupants.get(b.id)?.staff.length ?? 0) > 0) : bedrooms),
    [bedrooms, occupants, staffOnly],
  );
  const staffedCount = useMemo(
    () => (bedrooms ? bedrooms.filter((b) => (occupants.get(b.id)?.staff.length ?? 0) > 0).length : 0),
    [bedrooms, occupants],
  );
  const labelOf = useLabelOf();
  const { segments, params, navigate } = useRoute();
  const rawMode = modeOf(segments, params);
  // read-only viewers can't reach the forms even by URL
  const mode: Mode = readOnly && (rawMode.kind === "create" || rawMode.kind === "edit") ? { kind: "view" } : rawMode;
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function withBusy<T>(fn: () => Promise<T>): Promise<T> {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate(input: BedroomInput) {
    await withBusy(() => createBedroom(token, input));
    navigate("/bedrooms", { replace: true });
  }

  async function handleEdit(input: BedroomInput) {
    if (mode.kind !== "edit") return;
    const updated = await withBusy(() => updateBedroom(token, mode.id, input));
    navigate(`/bedrooms/${updated.id}`, { replace: true });
  }

  async function handleDelete(b: Bedroom) {
    if (!(await confirm({ emoji: "🗑️", title: tx("Excluir o quarto {name} ({group})?", { name: b.name, group: tx(GROUP_META[b.group].label) }), message: tx("Isso não pode ser desfeito."), confirmLabel: tx("Excluir"), danger: true }))) return;
    try {
      await withBusy(() => deleteBedroom(token, b.id));
      navigate("/bedrooms", { replace: true });
    } catch (e) {
      setError(te(e, "Algo deu errado."));
    }
  }

  if (!bedrooms) {
    return (
      <div className="admin-page">
        {error ? <p className="message message--error">{error}</p> : <p className="opt-empty">{tx("Sincronizando com o servidor… 🏕️")}</p>}
      </div>
    );
  }

  if (mode.kind === "detail") {
    return (
      <DetailStack
        token={token}
        current={{ kind: "bedroom", id: mode.id }}
        rootCrumbs={[{ label: tx("Quartos"), onClick: () => navigate("/bedrooms") }]}
        onEditBedroom={readOnly ? undefined : (bedroom) => navigate(`/bedrooms/${bedroom.id}/edit`)}
      />
    );
  }

  const editing = mode.kind === "edit" ? bedrooms.find((b) => b.id === mode.id) : undefined;

  const totals = listed.reduce(
    (acc, b) => ({ capacity: acc.capacity + b.capacity, occupied: acc.occupied + b.occupied }),
    { capacity: 0, occupied: 0 },
  );

  return (
    <div className="admin-page">
      {mode.kind === "create" && <Breadcrumbs items={[{ label: tx("Quartos"), onClick: () => navigate("/bedrooms") }, { label: tx("Novo") }]} />}
      {mode.kind === "edit" && editing && (
        <Breadcrumbs items={[{ label: tx("Quartos"), onClick: () => navigate("/bedrooms") }, { label: `${tx(GROUP_META[editing.group].label)} - ${editing.name}`, onClick: () => navigate(`/bedrooms/${editing.id}`) }, { label: tx("Editar") }]} />
      )}
      <header className="admin-head">
        <h1 className="admin-title">{mode.kind === "create" ? <><img className="admin-title__icon" src={ICONS.bed} alt="" aria-hidden="true" /> {tx("Novo quarto")}</> : mode.kind === "edit" ? tx("✏️ Editar quarto") : <><img className="admin-title__icon" src={ICONS.bed} alt="" aria-hidden="true" /> {tx("Quartos")}</>}</h1>
        {mode.kind === "view" && !readOnly && (
          <div className="admin-head__actions admin-head__actions--icons">
            <button
              type="button"
              className="button button--secondary admin-head__new"
              disabled={busy}
              title={tx("Montar os quartos: crianças grudadas por preferência, arrastando para os quartos")}
              onClick={() => navigate("/bedrooms/assign")}
            >
              <img className="admin-head__action-icon" src={ICONS.roomAssign} alt="" aria-hidden="true" />
              <span className="admin-head__action-label">{tx("Montar")}</span>
            </button>
            <button
              type="button"
              className="button button--secondary admin-head__new"
              disabled={busy || bedrooms.length === 0}
              title={tx("Baixar todos os quartos em Excel (uma aba por quarto)")}
              onClick={() => downloadBedroomsXlsx(bedrooms, campers, staff, labelOf)}
            >
              <DownloadGlyph /> <span className="admin-head__action-label">{tx("Download")}</span>
            </button>
            <button
              type="button"
              className="button button--primary admin-head__new"
              disabled={busy}
              onClick={() => navigate("/bedrooms/new")}
            >
              <span className="admin-head__action-icon" aria-hidden="true">+</span>
              <span className="admin-head__action-label">{tx("Novo")}</span>
            </button>
          </div>
        )}
        {mode.kind === "edit" && editing && (
          <button
            type="button"
            className="icon-btn icon-btn--lg icon-btn--danger"
            title={tx("Excluir quarto {name}", { name: editing.name })}
            aria-label={tx("Excluir quarto {name}", { name: editing.name })}
            disabled={busy}
            onClick={() => handleDelete(editing)}
          >
            🗑️
          </button>
        )}
      </header>

      {error && <p className="message message--error">{error}</p>}

      {mode.kind === "create" && (
        <BedroomForm key={mode.group ?? "any"} defaultGroup={mode.group} busy={busy} onSubmit={handleCreate} onCancel={() => navigate("/bedrooms")} />
      )}
      {mode.kind === "edit" && !editing && <p className="opt-empty">{tx("Quarto não encontrado.")}</p>}
      {mode.kind === "edit" && editing && (
        <BedroomForm
          key={editing.id}
          bedroom={editing}
          busy={busy}
          onSubmit={handleEdit}
          onCancel={() => navigate(`/bedrooms/${editing.id}`)}
        />
      )}

      {mode.kind === "view" && bedrooms.length === 0 && (
        <div className="admin-empty">
          <img className="admin-empty__icon" src={ICONS.bed} alt="" aria-hidden="true" />
          <p>{tx("Nenhum quarto ainda.")}{!readOnly && ` ${tx("Cadastre o primeiro com seus beliches e camas!")}`}</p>
          {!readOnly && (
            <button type="button" className="button button--primary" onClick={() => navigate("/bedrooms/new")}>
              {tx("+ Criar quarto")}
            </button>
          )}
        </div>
      )}

      {mode.kind === "view" && bedrooms.length > 0 && (
        <>
          <div className="health-filter" role="group" aria-label={tx("Filtros")}>
            <button
              type="button"
              className={`chip-toggle chip-toggle--small ${!staffOnly ? "chip-toggle--on" : ""}`}
              aria-pressed={!staffOnly}
              onClick={() => setStaffOnly(false)}
            >
              {tx("Todos")}
              <span className="cat-tab__count">{bedrooms.length}</span>
            </button>
            <button
              type="button"
              className={`chip-toggle chip-toggle--small ${staffOnly ? "chip-toggle--on" : ""}`}
              aria-pressed={staffOnly}
              title={tx("Quartos com equipe")}
              onClick={() => setStaffOnly(true)}
            >
              <StaffIcon size={20} />
              {tx("Equipe")}
              <span className="cat-tab__count">{staffedCount}</span>
            </button>
          </div>

          <p className="admin-intro">
            {tx("{n} quartos", { n: listed.length })} · <strong>{totals.capacity}</strong> {tx("camas no total")} ·{" "}
            <strong>{totals.occupied}</strong> {tx("ocupadas")} · <strong>{totals.capacity - totals.occupied}</strong> {tx("livres")}
          </p>

          {staffOnly && listed.length === 0 && <p className="opt-empty">{tx("Nenhum quarto com equipe.")}</p>}

          {BEDROOM_GROUPS.map((g) => {
            const rooms = listed.filter((b) => b.group === g);
            if (staffOnly && rooms.length === 0) return null;
            const m = GROUP_META[g];
            const cap = rooms.reduce((n, b) => n + b.capacity, 0);
            const occ = rooms.reduce((n, b) => n + b.occupied, 0);
            const groupLabel = tx(m.label);
            return (
              <section key={g} className="room-group">
                <header className="room-group__head">
                  <h2 className={`room-group__title room-group__title--${m.color}`}>
                    <GroupIcon group={g} /> {groupLabel}
                  </h2>
                  <span className="room-group__stats">
                    {tx(rooms.length === 1 ? "{n} quarto · {occ}/{cap} camas" : "{n} quartos · {occ}/{cap} camas", { n: rooms.length, occ, cap })}
                  </span>
                  {!readOnly && (
                    <button
                      type="button"
                      className="icon-btn"
                      title={tx("Novo quarto em {group}", { group: groupLabel })}
                      disabled={busy}
                      onClick={() => navigate("/bedrooms/new", { query: { group: g } })}
                    >
                      +
                    </button>
                  )}
                </header>

                {rooms.length === 0 ? (
                  <p className="opt-empty">{tx("Nenhum quarto nesta ala.")}</p>
                ) : (
                  <ul className="room-grid">
                    {rooms.map((b) => {
                      const pct = b.capacity ? Math.round((b.occupied / b.capacity) * 100) : 0;
                      const free = Math.max(0, b.capacity - b.occupied);
                      const people = occupants.get(b.id);
                      const kids = people?.kids ?? [];
                      const team = people?.staff ?? [];
                      return (
                        <li key={b.id}>
                          <button
                            type="button"
                            className={`room-card room-card--${m.color}`}
                            disabled={busy}
                            onClick={() => navigate(`/bedrooms/${b.id}`)}
                            title={tx("Ver quarto")}
                          >
                            <span className="room-card__row">
                              <span className="room-card__name">{b.name}</span>
                              <span className={`room-card__availability${free === 0 ? " room-card__availability--full" : ""}`}>
                                {free === 0 ? tx("Lotado") : tx(free === 1 ? "{n} livre" : "{n} livres", { n: free })}
                              </span>
                            </span>

                            <span className="room-card__occupancy-copy">
                              <strong>{b.occupied}</strong> {tx("de {capacity} camas ocupadas", { capacity: b.capacity })}
                            </span>
                            <span className="room-card__bar" aria-hidden="true">
                              <span className="room-card__bar-fill" style={{ width: `${pct}%` }} />
                            </span>

                            <span className="room-card__people">
                              {team.length > 0 && (
                                <span className="room-card__people-row">
                                  {team.map((s) => (
                                    <span key={s.id} className="room-card__person" title={shownName(s.name)}>
                                      <RoomRoleIcon role={s.roomRole} size={16} sex={staffSex(s, bedrooms)} />
                                      {shortPersonName(s.name, team) || NAME_PENDING}
                                    </span>
                                  ))}
                                </span>
                              )}
                              {kids.length > 0 && (
                                <span className="room-card__people-row">
                                  <KidIcon sex={kidSexOf(b.group)} group={kids.length > 1} size={16} />
                                  <span className="room-card__names" title={kids.map((k) => shownName(k.name)).join(", ")}>
                                    {kids.map((k) => shortPersonName(k.name, kids) || NAME_PENDING).join(", ")}
                                  </span>
                                </span>
                              )}
                              {team.length === 0 && kids.length === 0 && (
                                <span className="room-card__people-empty">{tx("Ninguém alocado.")}</span>
                              )}
                            </span>

                            <span className="room-card__details">
                              <span className="room-card__beds">
                                {b.bunkBeds > 0 && (
                                  <span title={tx(b.bunkBeds === 1 ? "{n} beliche" : "{n} beliches", { n: b.bunkBeds })}>
                                    <BunkIcon size={16} /> {tx(b.bunkBeds === 1 ? "{n} beliche" : "{n} beliches", { n: b.bunkBeds })}
                                  </span>
                                )}
                                {b.singleBeds > 0 && (
                                  <span title={tx(b.singleBeds === 1 ? "{n} cama de solteiro" : "{n} camas de solteiro", { n: b.singleBeds })}>
                                    {tx(b.singleBeds === 1 ? "{n} cama" : "{n} camas", { n: b.singleBeds })}
                                  </span>
                                )}
                              </span>
                            </span>
                            {b.notes && <span className="room-card__notes" title={b.notes}>{b.notes}</span>}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}

function sortRooms(list: Bedroom[]): Bedroom[] {
  return list.slice().sort((a, b) => a.name.localeCompare(b.name, collatorLocale(), { numeric: true }));
}

function occupantsByRoom(campers: Camper[], staff: Staff[]): Map<string, { kids: Camper[]; staff: Staff[] }> {
  const map = new Map<string, { kids: Camper[]; staff: Staff[] }>();
  const bucket = (id: string) => {
    let cur = map.get(id);
    if (!cur) {
      cur = { kids: [], staff: [] };
      map.set(id, cur);
    }
    return cur;
  };
  for (const k of campers) if (k.bedroom) bucket(k.bedroom).kids.push(k);
  for (const s of staff) if (s.bedroom) bucket(s.bedroom).staff.push(s);
  for (const cur of map.values()) {
    cur.kids.sort(compareByName);
    cur.staff.sort(compareRoomStaff);
  }
  return map;
}
