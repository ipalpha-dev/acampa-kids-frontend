import { useConfirm } from "../../components/ConfirmDialog";
import { useMemo, useState } from "react";
import {
  createEvent,
  createRole,
  deleteEvent,
  deleteRole,
  updateEvent,
  updateRole,
  type CampEvent,
  type CampEventInput,
  type ScheduleRole,
  type ScheduleRoleInput,
} from "../../api/schedule";
import AutoRoleBadge, { positionsMeta } from "../../components/AutoRoleBadge";
import ParentIcon from "../../components/ParentIcon";
import { speakDay } from "../../dates";
import { useCollection, useCollectionOrEmpty } from "../../store";
import DetailStack, { detailUrl, rememberTitle, viaCrumbs, type DetailRef } from "./DetailStack";
import EventDetail from "./EventDetail";
import { goBack, useRoute } from "../../router";
import Breadcrumbs from "../../components/Breadcrumbs";
import EventForm from "./EventForm";
import RoleForm from "./RoleForm";
import RichHtml from "../../components/RichHtml";
import { ICONS } from "../../icons";
import { collatorLocale, useI18n } from "../../i18n";

interface SchedulePageProps {
  token: string;
  /** a history session (archived year): no creating or editing events / roles */
  readOnly?: boolean;
}

type SubTab = "events" | "roles";
type Mode =
  | { kind: "view" }
  | { kind: "create-event"; date?: string }
  | { kind: "edit-event"; id: string }
  | { kind: "event"; id: string }
  | { kind: "stack"; root: DetailRef }
  | { kind: "create-role" }
  | { kind: "edit-role"; id: string };
function modeOf(segments: string[], params: URLSearchParams): { sub: SubTab; mode: Mode } {
  const [, area, id, action] = segments;
  if (area === "roles") {
    if (!id) return { sub: "roles", mode: { kind: "view" } };
    if (id === "new") return { sub: "roles", mode: { kind: "create-role" } };
    if (action === "edit") return { sub: "roles", mode: { kind: "edit-role", id } };
    return { sub: "roles", mode: { kind: "stack", root: { kind: "role", id } } };
  }
  if (area === "staff" && id) return { sub: "events", mode: { kind: "stack", root: { kind: "staff", id } } };
  if (area === "events" && id) {
    if (id === "new") return { sub: "events", mode: { kind: "create-event", date: params.get("date") ?? undefined } };
    if (action === "edit") return { sub: "events", mode: { kind: "edit-event", id } };
    return { sub: "events", mode: { kind: "event", id } };
  }
  return { sub: "events", mode: { kind: "view" } };
}

export default function SchedulePage({ token, readOnly = false }: SchedulePageProps) {
  const { tx, te } = useI18n();
  const storedEvents = useCollection("events");
  const events = useMemo(() => (storedEvents ? sortEvents(storedEvents) : null), [storedEvents]);
  const storedRoles = useCollectionOrEmpty("roles");
  const roles = useMemo(() => sortRoles(storedRoles), [storedRoles]);
  const staff = useCollectionOrEmpty("staff");
  const { segments, params, navigate } = useRoute();
  const { sub, mode: rawMode } = modeOf(segments, params);
  const mode: Mode = readOnly && (rawMode.kind === "create-event" || rawMode.kind === "edit-event" || rawMode.kind === "create-role" || rawMode.kind === "edit-role") ? { kind: "view" } : rawMode;
  const setSub = (t: SubTab) => navigate(t === "events" ? "/schedule" : "/schedule/roles");
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openRole, setOpenRole] = useState<string | null>(null);

  const roleById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);
  const usageByRole = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of events ?? []) for (const id of e.roles) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
  }, [events]);

  async function withBusy<T>(fn: () => Promise<T>): Promise<T> {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateEvent(input: CampEventInput) {
    const created = await withBusy(() => createEvent(token, input));
    navigate(`/schedule/events/${created.id}`, { replace: true });
  }
  async function handleEditEvent(input: CampEventInput) {
    if (mode.kind !== "edit-event") return;
    const updated = await withBusy(() => updateEvent(token, mode.id, input));
    navigate(`/schedule/events/${updated.id}`, { replace: true });
  }

  async function handleParentsVisible(e: CampEvent, next: boolean) {
    if (next === (e.visibleToParents !== false)) return;
    try {
      await updateEvent(token, e.id, { visibleToParents: next });
    } catch (err) {
      setError(te(err, "Algo deu errado."));
    }
  }

  async function handleDeleteEvent(e: CampEvent) {
    if (!(await confirm({ emoji: "🗑️", title: tx('Excluir "{title}"?', { title: e.title }), message: tx("{when} · Isso não pode ser desfeito.", { when: `${speakDay(e.date, "compact")} ${e.startTime}` }), confirmLabel: tx("Excluir"), danger: true }))) return;
    try {
      await withBusy(() => deleteEvent(token, e.id));
      navigate("/schedule", { replace: true });
    } catch (err) {
      setError(te(err, "Algo deu errado."));
    }
  }

  async function handleCreateRole(input: ScheduleRoleInput) {
    await withBusy(() => createRole(token, input));
    navigate("/schedule/roles", { replace: true });
  }
  async function handleEditRole(input: ScheduleRoleInput) {
    if (mode.kind !== "edit-role") return;
    const updated = await withBusy(() => updateRole(token, mode.id, input));
    navigate(`/schedule/roles/${updated.id}`, { replace: true });
  }
  async function handleDeleteRole(r: ScheduleRole) {
    if (!(await confirm({ emoji: "🗑️", title: tx('Excluir a função "{name}"?', { name: r.name }), message: tx("Isso não pode ser desfeito."), confirmLabel: tx("Excluir"), danger: true }))) return;
    try {
      await withBusy(() => deleteRole(token, r.id));
      navigate("/schedule/roles", { replace: true });
    } catch (err) {
      setError(te(err, "Algo deu errado."));
    }
  }

  if (!events) {
    return (
      <div className="admin-page">
        {error ? <p className="message message--error">{error}</p> : <p className="opt-empty">{tx("Sincronizando com o servidor… 🏕️")}</p>}
      </div>
    );
  }

  if (mode.kind === "event") {
    const ev = events.find((x) => x.id === mode.id);
    if (!ev) {
      return (
        <div className="admin-page">
          <p className="opt-empty">{tx("Evento não encontrado.")}</p>
          <button type="button" className="button button--secondary" onClick={() => navigate("/schedule", { replace: true })}>
            {tx("Ver programação")}
          </button>
        </div>
      );
    }
    const me: DetailRef = { kind: "event", id: ev.id };
    rememberTitle(me, `${ev.emoji} ${ev.title}`);
    const { via, crumbs } = viaCrumbs(params);
    const chain = [...via, me];
    return (
      <EventDetail
        token={token}
        event={ev}
        roles={roles}
        staff={staff}
        crumbs={[{ label: tx("Programação"), onClick: () => navigate("/schedule") }, ...crumbs, { label: `${ev.emoji} ${ev.title}` }]}
        onEdit={() => navigate(`/schedule/events/${ev.id}/edit`)}
        onOpenStaff={(id) => navigate(detailUrl({ kind: "staff", id }, chain))}
      />
    );
  }
  if (mode.kind === "stack") {
    return (
      <DetailStack
        token={token}
        current={mode.root}
        rootCrumbs={[{ label: tx("Programação"), onClick: () => navigate(sub === "roles" ? "/schedule/roles" : "/schedule") }]}
        onEditRole={(role) => navigate(`/schedule/roles/${role.id}/edit`)}
      />
    );
  }

  const days = [...new Set(events.map((e) => e.date))].sort();
  const inForm = mode.kind !== "view";
  const editingEvent = mode.kind === "edit-event" ? events.find((e) => e.id === mode.id) : undefined;
  const editingRole = mode.kind === "edit-role" ? roles.find((r) => r.id === mode.id) : undefined;
  const cancel = () => goBack(sub === "roles" ? "/schedule/roles" : "/schedule");

  return (
    <div className="admin-page">
      {inForm && (
        <Breadcrumbs
          items={[
            { label: tx("Programação"), onClick: () => navigate(sub === "roles" ? "/schedule/roles" : "/schedule") },
            ...(mode.kind === "edit-event" && editingEvent ? [{ label: editingEvent.title, onClick: () => navigate(`/schedule/events/${editingEvent.id}`) }] : []),
            ...(mode.kind === "edit-role" && editingRole ? [{ label: editingRole.name, onClick: () => navigate(`/schedule/roles/${editingRole.id}`) }] : []),
            { label: mode.kind === "create-event" ? tx("Novo evento") : mode.kind === "create-role" ? tx("Nova função") : tx("Editar") },
          ]}
        />
      )}
      <header className="admin-head">
        <h1 className="admin-title">
          {mode.kind === "create-event" ? (
            <>
              <img className="admin-title__icon" src={ICONS.schedule} alt="" aria-hidden="true" /> {tx("Novo evento")}
            </>
          ) : mode.kind === "edit-event" ? (
            tx("✏️ Editar evento")
          ) : mode.kind === "create-role" ? (
            tx("🎯 Nova função")
          ) : mode.kind === "edit-role" ? (
            tx("✏️ Editar função")
          ) : (
            <>
              <img className="admin-title__icon" src={ICONS.schedule} alt="" aria-hidden="true" /> {tx("Programação")}
            </>
          )}
        </h1>
        {!inForm && !readOnly && (
          <button
            type="button"
            className="button button--primary admin-head__new"
            disabled={busy}
            onClick={() => navigate(sub === "events" ? "/schedule/events/new" : "/schedule/roles/new")}
          >
            {sub === "events" ? tx("+ Evento") : tx("+ Função")}
          </button>
        )}
        {mode.kind === "edit-event" && editingEvent && (
          <button
            type="button"
            className="icon-btn icon-btn--lg icon-btn--danger"
            title={tx('Excluir evento "{title}"', { title: editingEvent.title })}
            aria-label={tx('Excluir evento "{title}"', { title: editingEvent.title })}
            disabled={busy}
            onClick={() => handleDeleteEvent(editingEvent)}
          >
            🗑️
          </button>
        )}
        {mode.kind === "edit-role" && editingRole && (
          <button
            type="button"
            className="icon-btn icon-btn--lg icon-btn--danger"
            title={
              (usageByRole.get(editingRole.id) ?? 0) > 0
                ? tx("Remova esta função dos {n} evento(s) antes de excluir", { n: usageByRole.get(editingRole.id) ?? 0 })
                : tx('Excluir função "{name}"', { name: editingRole.name })
            }
            aria-label={tx('Excluir função "{name}"', { name: editingRole.name })}
            disabled={busy || (usageByRole.get(editingRole.id) ?? 0) > 0}
            onClick={() => handleDeleteRole(editingRole)}
          >
            🗑️
          </button>
        )}
      </header>

      {!inForm && (
        <div className="staff-toolbar__filters" role="tablist" aria-label={tx("Programação")}>
          <button
            type="button"
            role="tab"
            aria-selected={sub === "events"}
            className={`cat-tab ${sub === "events" ? "cat-tab--active" : ""}`}
            onClick={() => setSub("events")}
          >
            <img className="cat-tab__img" src={ICONS.schedule} alt="" aria-hidden="true" /> {tx("Eventos")}
            <span className="cat-tab__count">{events.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={sub === "roles"}
            className={`cat-tab ${sub === "roles" ? "cat-tab--active" : ""}`}
            onClick={() => setSub("roles")}
          >
            🎯 {tx("Funções")}
            <span className="cat-tab__count">{roles.length}</span>
          </button>
        </div>
      )}

      {error && <p className="message message--error">{error}</p>}

      {mode.kind === "create-event" && (
        <EventForm key={mode.date ?? "any"} token={token} defaultDate={mode.date} busy={busy} onSubmit={handleCreateEvent} onCancel={cancel} />
      )}
      {mode.kind === "edit-event" && !editingEvent && <p className="opt-empty">{tx("Evento não encontrado.")}</p>}
      {mode.kind === "edit-event" && editingEvent && (
        <EventForm key={editingEvent.id} token={token} event={editingEvent} busy={busy} onSubmit={handleEditEvent} onCancel={cancel} />
      )}
      {mode.kind === "create-role" && <RoleForm token={token} busy={busy} onSubmit={handleCreateRole} onCancel={cancel} />}
      {mode.kind === "edit-role" && !editingRole && <p className="opt-empty">{tx("Função não encontrada.")}</p>}
      {mode.kind === "edit-role" && editingRole && (
        <RoleForm key={editingRole.id} token={token} role={editingRole} busy={busy} onSubmit={handleEditRole} onCancel={cancel} />
      )}

      {!inForm && sub === "events" && events.length === 0 && (
        <div className="admin-empty">
          <img className="admin-empty__icon" src={ICONS.schedule} alt="" aria-hidden="true" />
          <p>{tx("Nenhum evento ainda. Monte a programação do acampamento!")}</p>
          {!readOnly && (
            <button type="button" className="button button--primary" onClick={() => navigate("/schedule/events/new")}>
              {tx("+ Criar evento")}
            </button>
          )}
        </div>
      )}

      {!inForm && sub === "events" &&
        days.map((d) => (
          <section key={d} className="day-group">
            <header className="room-group__head">
              <h2 className="room-group__title room-group__title--green">📆 {speakDay(d)}</h2>
              <span className="room-group__stats" />
              {!readOnly && (
                <button type="button" className="icon-btn" title={tx("Novo evento em {day}", { day: speakDay(d, "compact") })} disabled={busy} onClick={() => navigate("/schedule/events/new", { query: { date: d } })}>
                  +
                </button>
              )}
            </header>
            <ol className="timeline">
              {events
                .filter((e) => e.date === d)
                .map((e) => (
                  <li key={e.id} className="timeline__item">
                    <div className="timeline__time">
                      <span className="timeline__start">{e.startTime}</span>
                      {e.endTime && <span className="timeline__end">{e.endTime}</span>}
                    </div>
                    <div
                      className={`event-card event-card--clickable ${e.roles.length === 0 ? "event-card--plain" : ""}`}
                      role="link"
                      tabIndex={0}
                      title={tx("Ver evento {title}", { title: e.title })}
                      onClick={() => navigate(`/schedule/events/${e.id}`)}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter" || ev.key === " ") {
                          ev.preventDefault();
                          navigate(`/schedule/events/${e.id}`);
                        }
                      }}
                    >
                      <h3 className="event-card__title">
                        <span className="event-card__title-text"><span aria-hidden="true">{e.emoji}</span> {e.title}</span>
                        <button
                          type="button"
                          className={`event-card__parents ${e.visibleToParents === false ? "event-card__parents--off" : ""}`}
                          title={e.visibleToParents === false ? tx("Só a equipe vê — clicar para os pais verem") : tx("Os pais veem — clicar para esconder")}
                          aria-pressed={e.visibleToParents !== false}
                          aria-label={e.visibleToParents === false ? tx("Os pais não veem este evento") : tx("Os pais veem este evento")}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            void handleParentsVisible(e, e.visibleToParents === false);
                          }}
                        >
                          <ParentIcon size={16} />
                        </button>
                      </h3>
                      {e.notes && <p className="staff-card__meta">{e.notes}</p>}
                      {e.roles.length > 0 && (
                        <div className="staff-card__tags">
                          {e.roles.map((id) => {
                            const r = roleById.get(id);
                            if (!r) return null;
                            const openRole = (ev: React.MouseEvent) => {
                              ev.stopPropagation();
                              navigate(detailUrl({ kind: "role", id }, [{ kind: "event", id: e.id }]));
                            };
                            const who = positionsMeta(r.forRoomRoles);
                            const n = e.assignments.filter((a) => a.roleId === id).length;
                            if (who) {
                              return (
                                <button
                                  key={id}
                                  type="button"
                                  className="staff-tag staff-tag--everyone staff-tag--link"
                                  title={n > 0
                                    ? tx("{name}: vai sozinha para {who} + {n} escalado(s) — ver função", { name: r.name, who: who.label, n })
                                    : tx("{name}: vai sozinha para {who} — ver função", { name: r.name, who: who.label })}
                                  onClick={openRole}
                                >
                                  <img className="audience-icon" src={who.icon} alt="" aria-hidden="true" /> {r.emoji} {r.name}
                                  {n > 0 && <span className="staff-tag__n">+{n}</span>}
                                </button>
                              );
                            }
                            return (
                              <button key={id} type="button" className={`staff-tag staff-tag--link ${n === 0 ? "staff-tag--empty" : ""}`} title={n === 0 ? tx("{name}: ninguém escalado — ver função", { name: r.name }) : tx("{name}: {n} escalado(s) — ver função", { name: r.name, n })} onClick={openRole}>
                                {r.emoji} {r.name}
                                <span className="staff-tag__n">{n}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
            </ol>
          </section>
        ))}

      {!inForm && sub === "roles" && roles.length === 0 && (
        <div className="admin-empty">
          <span className="admin-empty__emoji">🎯</span>
          <p>{tx("Nenhuma função ainda. Cadastre o que a equipe faz em cada evento — com instruções!")}</p>
          {!readOnly && (
            <button type="button" className="button button--primary" onClick={() => navigate("/schedule/roles/new")}>
              {tx("+ Criar função")}
            </button>
          )}
        </div>
      )}

      {!inForm && sub === "roles" && roles.length > 0 && (
        <ul className="staff-list">
          {roles.map((r) => {
            const used = usageByRole.get(r.id) ?? 0;
            const open = openRole === r.id;
            return (
              <li key={r.id} className="staff-card staff-card--clickable role-card">
                <div
                  className="staff-card__body"
                  role="link"
                  tabIndex={0}
                  title={tx("Ver função {name}", { name: r.name })}
                  onClick={() => navigate(`/schedule/roles/${r.id}`)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") {
                      ev.preventDefault();
                      navigate(`/schedule/roles/${r.id}`);
                    }
                  }}
                >
                  <h3 className="staff-card__name">
                    <span aria-hidden="true">{r.emoji}</span> {r.name}
                  </h3>
                  <p className="staff-card__meta">
                    <AutoRoleBadge role={r} />
                    {r.forRoomRoles.length > 0 && " · "}
                    {used === 0 ? tx("Não usada em nenhum evento") : used === 1 ? tx("Usada em {n} evento", { n: used }) : tx("Usada em {n} eventos", { n: used })}
                    {" · "}
                    {r.instructions ? (
                      <button
                        type="button"
                        className="link-btn"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setOpenRole(open ? null : r.id);
                        }}
                      >
                        {open ? tx("ocultar instruções") : tx("ver instruções")}
                      </button>
                    ) : (
                      <span className="cat-hint--error">{tx("sem instruções")}</span>
                    )}
                  </p>
                  {open && r.instructions && (
                    <RichHtml html={r.instructions} onClick={(ev) => ev.stopPropagation()} />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function sortEvents(list: CampEvent[]): CampEvent[] {
  return list.slice().sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.title.localeCompare(b.title, collatorLocale()));
}
function sortRoles(list: ScheduleRole[]): ScheduleRole[] {
  return list.slice().sort((a, b) => a.name.localeCompare(b.name, collatorLocale(), { sensitivity: "base" }));
}
