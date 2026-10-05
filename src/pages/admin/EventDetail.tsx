import { useMemo, useState } from "react";
import { assignStaff, isForWholeTeam, peopleInRole, unassignStaff, updateEvent, updateRole, roleDetailOf, DETAIL_COLORS, type CampEvent, type ScheduleRole, type ScheduleRoleInput } from "../../api/schedule";
import { positionsMeta } from "../../components/AutoRoleBadge";
import { contrastText } from "../../api/teams";
import { useTeamOf } from "../../store/derive";
import { speakDay } from "../../dates";
import type { Staff } from "../../api/staff";
import Breadcrumbs, { type Crumb } from "../../components/Breadcrumbs";
import { useConfirm } from "../../components/ConfirmDialog";
import RichTextBox from "../../components/RichTextBox";
import Dialog from "../../components/Dialog";
import ParentIcon from "../../components/ParentIcon";
import Toggle from "../../components/Toggle";
import { ICONS } from "../../icons";
import AddRoleDialog from "./AddRoleDialog";
import AssignRoleDialog from "./AssignRoleDialog";
import RoleDocEditor, { type RoleDocField } from "./RoleDocEditor";
import RoleForm from "./RoleForm";
import { useI18n } from "../../i18n";
import { firstNameOf, shownName } from "./staffNames";

interface EventDetailProps {
  token: string;
  event: CampEvent;
  roles: ScheduleRole[];
  staff: Staff[];
  crumbs: Crumb[];
  onEdit: () => void;
  onOpenStaff: (staffId: string) => void;
}

export default function EventDetail({ token, event: e, roles, staff, crumbs, onEdit, onOpenStaff }: EventDetailProps) {
  const { tx } = useI18n();
  const [addTo, setAddTo] = useState<ScheduleRole | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<ScheduleRole | null>(null);
  const [addingRole, setAddingRole] = useState(false);
  const [editDoc, setEditDoc] = useState<{ role: ScheduleRole; field: RoleDocField } | null>(null);
  const [savingRole, setSavingRole] = useState(false);
  const [editDetail, setEditDetail] = useState<{ role: ScheduleRole; staffId: string; value: string; color: string } | null>(null);
  const [savingDetail, setSavingDetail] = useState(false);
  const [savingParents, setSavingParents] = useState(false);
  const confirm = useConfirm();
  const parentsSee = e.visibleToParents !== false;

  async function handleParentsVisible(next: boolean) {
    if (next === parentsSee) return;
    setSavingParents(true);
    setError(null);
    try {
      await updateEvent(token, e.id, { visibleToParents: next });
    } catch (err) {
      setError(err instanceof Error ? err.message : tx("Algo deu errado."));
    } finally {
      setSavingParents(false);
    }
  }

  async function handleSaveDetail(ev: React.FormEvent) {
    ev.preventDefault();
    if (!editDetail) return;
    setSavingDetail(true);
    setError(null);
    try {
      await assignStaff(token, e.id, editDetail.staffId, editDetail.role.id, editDetail.value.trim(), editDetail.color);
      setEditDetail(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : tx("Algo deu errado."));
    } finally {
      setSavingDetail(false);
    }
  }

  async function handleSaveRole(input: ScheduleRoleInput) {
    if (!editRole) return;
    setSavingRole(true);
    try {
      await updateRole(token, editRole.id, input);
      setEditRole(null);
    } finally {
      setSavingRole(false);
    }
  }

  const roleById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);
  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);
  const teamOf = useTeamOf();

  const eventRoles = e.roles.map((id) => roleById.get(id)).filter((r): r is ScheduleRole => !!r);

  const eventContext = tx("em {emoji} {title} · {when}", { emoji: e.emoji, title: e.title, when: `${speakDay(e.date, "weekday")} ${e.startTime}` });

  const whoDoes = (r: ScheduleRole) => peopleInRole(e, r, staff, roleById);

  async function handleRemove(staffId: string) {
    setBusy(staffId);
    setError(null);
    try {
      await unassignStaff(token, e.id, staffId);
    } catch (err) {
      setError(err instanceof Error ? err.message : tx("Algo deu errado."));
    } finally {
      setBusy(null);
    }
  }

  async function handleUnplug(role: ScheduleRole) {
    const people = whoDoes(role).length;
    const ok = await confirm({
      emoji: "✕",
      title: tx("Tirar {emoji} {name} deste evento?", { emoji: role.emoji, name: role.name }),
      message: people
        ? people === 1
          ? tx("A 1 pessoa que faz esta função aqui sai dela neste evento. A função continua no catálogo.")
          : tx("As {n} pessoas que fazem esta função aqui saem dela neste evento. A função continua no catálogo.", { n: people })
        : tx("A função sai deste evento. Ela continua no catálogo."),
      confirmLabel: tx("Tirar"),
      danger: true,
    });
    if (!ok) return;
    setBusy(`role:${role.id}`);
    setError(null);
    try {
      await updateEvent(token, e.id, { roles: e.roles.filter((id) => id !== role.id) });
    } catch (err) {
      setError(err instanceof Error ? err.message : tx("Algo deu errado."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="admin-page">
      <Breadcrumbs items={crumbs} />
      <header className="admin-head">
        <h1 className="admin-title detail-title">
          <span aria-hidden="true">{e.emoji}</span> {e.title}
        </h1>
        <button type="button" className="icon-btn icon-btn--lg" title={tx("Editar evento")} aria-label={tx("Editar evento")} onClick={onEdit}>
          <span className="pencil" aria-hidden="true">✏️</span>
        </button>
      </header>

      <section className="detail-card">
        <dl className="detail-grid">
          <dt>{tx("Quando")}</dt>
          <dd>
            {speakDay(e.date)} · {e.startTime}
            {e.endTime && `–${e.endTime}`}
          </dd>
          <dt>{tx("Pais")}</dt>
          <dd>
            <Toggle checked={parentsSee} onChange={(v) => void handleParentsVisible(v)} disabled={savingParents} label={<><ParentIcon size={16} /> {parentsSee ? tx("veem") : tx("não veem")}</>} />
          </dd>
          {e.notes && (
            <>
              <dt>{tx("Observações")}</dt>
              <dd>{e.notes}</dd>
            </>
          )}
        </dl>
      </section>

      <section className="detail-section">
        <div className="detail-h2-row">
          <h2 className="detail-h2">
            🎯 {tx("Funções")} <span className="cat-tab__count">{eventRoles.length}</span>
          </h2>
          <button
            type="button"
            className="icon-btn event-role__add"
            title={tx("Adicionar função neste evento")}
            aria-label={tx("Adicionar função neste evento")}
            onClick={() => setAddingRole(true)}
          >
            +
          </button>
        </div>

        {error && <p className="message message--error">{error}</p>}

        {eventRoles.length === 0 && (
          <p className="opt-empty">
            {tx("Este evento não tem funções.")}{" "}
            <button type="button" className="link-btn" onClick={() => setAddingRole(true)}>
              {tx("adicionar")}
            </button>
          </p>
        )}

        {eventRoles.map((r) => {
          const people = whoDoes(r);
          const picked = people.filter((p) => p.via === "person");
          const byPosition = people.length - picked.length;
          const positions = positionsMeta(r.forRoomRoles);
          return (
            <div key={r.id} className={`detail-card event-role ${positions ? "event-role--default" : ""}`}>
              <div className="event-role__head">
                {positions && <span className="cat-field__label event-role__standard">{tx("Por posição")}</span>}
                <h3 className="event-role__name">
                  <span aria-hidden="true">{r.emoji}</span> {r.name}
                </h3>
                <span className="cat-tab__count event-role__count">{people.length}</span>
                <div className="event-role__actions">
                  <button
                    type="button"
                    className="icon-btn icon-btn--bare"
                    title={tx("Editar a função {name}", { name: r.name })}
                    aria-label={tx("Editar a função {name}", { name: r.name })}
                    onClick={() => setEditRole(r)}
                  >
                    <img className="pencil-icon" src={ICONS.pencil} alt="" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="icon-btn icon-btn--bare"
                    title={tx("Tirar {name} deste evento", { name: r.name })}
                    aria-label={tx("Tirar {name} deste evento", { name: r.name })}
                    disabled={!!busy}
                    onClick={() => void handleUnplug(r)}
                  >
                    <span className="event-role__x" aria-hidden="true">×</span>
                  </button>
                </div>
              </div>

              {r.detailFromTeam && <p className="cat-hint">{tx("🚩 O detalhe é o time de cada um — mude o time na ficha da pessoa.")}</p>}

              <div className="staff-card__tags">
                {positions && (
                  <span
                    className="staff-tag staff-tag--everyone"
                    title={byPosition === 1 ? tx("{n} pessoa: {hint}, sem escalar uma por uma", { n: byPosition, hint: positions.hint }) : tx("{n} pessoas: {hint}, sem escalar uma por uma", { n: byPosition, hint: positions.hint })}
                  >
                    <img className="audience-icon" src={positions.icon} alt="" aria-hidden="true" /> {positions.label}
                    <span className="staff-tag__n">{byPosition}</span>
                  </span>
                )}
                {picked.map(({ staff: s, assignment }) => {
                  const { detail, detailColor } = roleDetailOf(r, assignment, teamOf(s.team));
                  return (
                    <span
                      key={s.id}
                      className={`staff-tag staff-tag--soft staff-tag--person ${busy === s.id ? "staff-tag--busy" : ""}`}
                      title={tx("{name} foi escalado(a) à mão", { name: shownName(s.name) })}
                    >
                      <button type="button" className="staff-tag__open" title={tx("Ver {name}", { name: shownName(s.name) })} onClick={() => onOpenStaff(s.id)}>
                        {shownName(s.name)}
                      </button>
                      {r.hasDetail && r.detailFromTeam && (
                        <span
                          className={`staff-tag__detail ${detail ? "staff-tag__detail--tinted" : "staff-tag__detail--empty"}`}
                          style={detailColor ? { background: detailColor, color: contrastText(detailColor) } : undefined}
                          title={detail ? tx("Time de {name}", { name: shownName(s.name) }) : tx("{name} não tem time", { name: shownName(s.name) })}
                        >
                          {detail || <span aria-hidden="true">{tx("sem time")}</span>}
                        </span>
                      )}
                      {r.hasDetail && !r.detailFromTeam && (
                        <button
                          type="button"
                          className={`staff-tag__detail ${detail ? "" : "staff-tag__detail--empty"} ${detailColor ? "staff-tag__detail--tinted" : ""}`}
                          style={detailColor ? { background: detailColor, color: contrastText(detailColor) } : undefined}
                          title={detail ? tx("Mudar o detalhe de {name}", { name: shownName(s.name) }) : tx("Preencher o detalhe de {name}", { name: shownName(s.name) })}
                          aria-label={detail ? tx("Mudar o detalhe de {name}: {detail}", { name: shownName(s.name), detail }) : tx("Preencher o detalhe de {name}", { name: shownName(s.name) })}
                          disabled={!!busy}
                          onClick={() => setEditDetail({ role: r, staffId: s.id, value: assignment?.detail ?? "", color: assignment?.detailColor ?? "" })}
                        >
                          {detail || <span aria-hidden="true">-----</span>}
                        </button>
                      )}
                      <button
                        type="button"
                        className="staff-tag__x"
                        title={tx("Tirar {person} de {role}", { person: shownName(s.name), role: r.name })}
                        aria-label={tx("Tirar {person} de {role}", { person: shownName(s.name), role: r.name })}
                        disabled={!!busy}
                        onClick={() => handleRemove(s.id)}
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
                {!isForWholeTeam(r) && (
                  <button type="button" className="add-person-btn" title={tx("Escalar alguém como {name}", { name: r.name })} disabled={!!busy} onClick={() => setAddTo(r)}>
                    {people.length === 0 ? tx("Adicionar pessoa") : tx("Adicionar")} <span aria-hidden="true">+</span>
                  </button>
                )}
              </div>
              <RoleDocs role={r} context={eventContext} onEditDoc={(field) => setEditDoc({ role: r, field })} />
            </div>
          );
        })}
      </section>

      <AddRoleDialog
        token={token}
        open={addingRole}
        roles={roles}
        excludeIds={e.roles}
        where={tx("em {emoji} {title}", { emoji: e.emoji, title: e.title })}
        onAdd={async (roleId) => {
          await updateEvent(token, e.id, { roles: [...e.roles, roleId] });
        }}
        onClose={() => setAddingRole(false)}
      />

      {editDoc && (
        <RoleDocEditor
          token={token}
          role={editDoc.role}
          field={editDoc.field}
          context={eventContext}
          onClose={() => setEditDoc(null)}
        />
      )}

      <AssignRoleDialog
        key={addTo?.id ?? "none"}
        token={token}
        open={!!addTo}
        entry={{ eventId: e.id, roleId: addTo?.id ?? "" }}
        onClose={() => setAddTo(null)}
        onAssigned={() => {}}
      />

      <Dialog
        open={!!editRole}
        onClose={() => !savingRole && setEditRole(null)}
        title={editRole ? `${editRole.emoji} ${editRole.name}` : ""}
        width={680}
        dismissible={false}
        className="sheet-dialog role-sheet"
      >
        {editRole && (
          <RoleForm
            embedded
            hideDocs
            token={token}
            role={editRole}
            busy={savingRole}
            onSubmit={handleSaveRole}
            onCancel={() => setEditRole(null)}
          />
        )}
      </Dialog>

      <Dialog
        open={!!editDetail}
        onClose={() => !savingDetail && setEditDetail(null)}
        title={editDetail ? `${editDetail.role.emoji} ${editDetail.role.name}` : ""}
        width={460}
      >
        {editDetail && (
          <form className="cat-form cat-form--embedded" onSubmit={handleSaveDetail}>
            <h2 className="cat-form__title change-room__title">
              {tx("🏷️ Detalhe — {name}", { name: firstNameOf(staffById.get(editDetail.staffId)?.name) })}
            </h2>
            <label className="cat-field">
              <span className="cat-field__label">{tx("Detalhe")}</span>
              <input
                className="cat-input"
                placeholder={editDetail.role.detailPlaceholder || tx("ex.: Base 3")}
                value={editDetail.value}
                maxLength={60}
                autoFocus
                disabled={savingDetail}
                onChange={(ev) => setEditDetail({ ...editDetail, value: ev.target.value })}
              />
            </label>
            <div className="cat-field">
              <span className="cat-field__label">{tx("Cor")}</span>
              <div className="swatch-group">
                <button
                  type="button"
                  className={`swatch swatch--none ${editDetail.color ? "" : "swatch--on"}`}
                  title={tx("Sem cor")}
                  aria-label={tx("Sem cor")}
                  aria-pressed={!editDetail.color}
                  disabled={savingDetail}
                  onClick={() => setEditDetail({ ...editDetail, color: "" })}
                >
                  ✕
                </button>
                {DETAIL_COLORS.map((c) => (
                  <button
                    key={c.hex}
                    type="button"
                    className={`swatch ${editDetail.color.toLowerCase() === c.hex ? "swatch--on" : ""}`}
                    style={{ background: c.hex }}
                    title={tx(c.name)}
                    aria-label={tx(c.name)}
                    aria-pressed={editDetail.color.toLowerCase() === c.hex}
                    disabled={savingDetail}
                    onClick={() => setEditDetail({ ...editDetail, color: c.hex })}
                  />
                ))}
                <label className="swatch swatch--custom" title={tx("Cor personalizada")}>
                  <input
                    type="color"
                    value={editDetail.color || "#0f9a8a"}
                    disabled={savingDetail}
                    onChange={(ev) => setEditDetail({ ...editDetail, color: ev.target.value })}
                    aria-label={tx("Cor personalizada")}
                  />
                </label>
              </div>
            </div>
            <div className="cat-form__actions">
              <button type="button" className="button button--secondary" disabled={savingDetail} onClick={() => setEditDetail(null)}>
                {tx("Cancelar")}
              </button>
              <button type="submit" className="button button--primary" disabled={savingDetail}>
                {savingDetail ? tx("Salvando…") : tx("Salvar")}
              </button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}

function RoleDocs({ role: r, context, onEditDoc }: { role: ScheduleRole; context: string; onEditDoc: (field: RoleDocField) => void }) {
  const { tx } = useI18n();
  const title = `${r.emoji} ${r.name}`;
  return (
    <div className="event-role__docs">
      <RichTextBox
        label={<><img className="audience-icon" src={ICONS.preparation} alt="" aria-hidden="true" /> {tx("Preparação (antes do acampamento)")}</>}
        html={r.preparation}
        title={title}
        context={context}
        emptyHint={tx("Nada a preparar para esta função.")}
        onEdit={() => onEditDoc("preparation")}
      />
      <RichTextBox
        label={tx("📝 Instruções para a equipe")}
        html={r.instructions}
        title={title}
        context={context}
        emptyHint={tx("Sem instruções ainda.")}
        onEdit={() => onEditDoc("instructions")}
      />
    </div>
  );
}
