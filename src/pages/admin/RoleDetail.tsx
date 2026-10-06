import { useEffect, useState } from "react";
import { type RoleEventUsage, type ScheduleRole } from "../../api/schedule";
import { speakDay } from "../../dates";
import { useRoleDetail } from "../../store/derive";
import { positionsMeta } from "../../components/AutoRoleBadge";
import { isForWholeTeam } from "../../api/schedule";
import Breadcrumbs from "../../components/Breadcrumbs";
import RichHtml from "../../components/RichHtml";
import StaffIcon from "../../components/StaffIcon";
import { ICONS } from "../../icons";
import AssignRoleDialog from "./AssignRoleDialog";
import type { DetailNav } from "./DetailStack";
import { useI18n } from "../../i18n";
import { shownName } from "./staffNames";

interface RoleDetailProps {
  token: string;
  roleId: string;
  nav: DetailNav;
  onEdit: (role: ScheduleRole) => void;
  onOpenStaff?: (staffId: string) => void;
  onOpenEvent?: (eventId: string) => void;
}

export default function RoleDetail({ token, roleId, nav, onEdit, onOpenStaff, onOpenEvent }: RoleDetailProps) {
  const { tx } = useI18n();
  const data = useRoleDetail(roleId);
  const error = data === undefined ? tx("Função não encontrada.") : null;
  const [addTo, setAddTo] = useState<RoleEventUsage | null>(null);

  const { setTitle } = nav;
  useEffect(() => {
    if (data) setTitle(`${data.role.emoji} ${data.role.name}`);
  }, [data, setTitle]);

  if (!data) {
    return (
      <div className="admin-page">
        <Breadcrumbs items={nav.crumbs} />
        {error ? <p className="message message--error">{error}</p> : <p className="opt-empty">{tx("Sincronizando… 🏕️")}</p>}
      </div>
    );
  }

  const { role: r, events: usage } = data;
  const days = [...new Set(usage.map((e) => e.date))].sort();
  const totalPeople = new Set(usage.flatMap((e) => e.people.map((p) => p.staffId))).size;
  const positions = positionsMeta(r.forRoomRoles);

  return (
    <div className="admin-page">
      <Breadcrumbs items={nav.crumbs} />
      <header className="admin-head">
        <h1 className="admin-title detail-title">
          <span aria-hidden="true">{r.emoji}</span> {r.name}
        </h1>
        <button type="button" className="icon-btn icon-btn--lg" title={tx("Editar função")} aria-label={tx("Editar função")} onClick={() => onEdit(r)}>
          <span className="pencil" aria-hidden="true">✏️</span>
        </button>
      </header>

      <section className="detail-card">
        <span className="cat-field__label">{tx("📝 Instruções para a equipe")}</span>
        {r.instructions ? (
          <RichHtml html={r.instructions} />
        ) : (
          <p className="opt-empty">
            {tx("Sem instruções ainda.")}{" "}
            <button type="button" className="link-btn" onClick={() => onEdit(r)}>
              {tx("escrever")}
            </button>
          </p>
        )}
        <span className="cat-field__label"><img className="audience-icon" src={ICONS.preparation} alt="" aria-hidden="true" /> {tx("Preparação (antes do acampamento)")}</span>
        {r.preparation ? (
          <RichHtml html={r.preparation} />
        ) : (
          <p className="opt-empty">
            {tx("Nada a preparar para esta função.")}{" "}
            <button type="button" className="link-btn" onClick={() => onEdit(r)}>
              {tx("escrever")}
            </button>
          </p>
        )}
        <p className="cat-hint">
          {positions ? (
            <>
              <img className="audience-icon" src={positions.icon} alt="" aria-hidden="true" /> {tx("Vai sozinha para")}{" "}
              <strong>{positions.label}</strong> {tx("nos eventos abaixo, exceto quem tiver outra função lá.")}
              {" "}{tx("Dá para acrescentar pessoas específicas em cada evento.")}
            </>
          ) : (
            <>{tx("🎯 Só quem for escalado — pessoa por pessoa, em cada evento.")}</>
          )}
        </p>
      </section>

      <section className="detail-section">
        <h2 className="detail-h2">
          <img className="audience-icon" src={ICONS.schedule} alt="" aria-hidden="true" /> {tx("Onde é usada")} <span className="cat-tab__count">{usage.length}</span>
          {usage.length > 0 && (
            <span className="cat-hint">
              · <StaffIcon size={16} /> {totalPeople === 1 ? tx("{n} pessoa", { n: totalPeople }) : tx("{n} pessoas", { n: totalPeople })}
            </span>
          )}
        </h2>
        {usage.length === 0 && <p className="opt-empty">{tx("Esta função ainda não está em nenhum evento.")}</p>}
        {days.map((d) => (
          <div key={d} className="detail-day">
            <h3 className="detail-h3">{speakDay(d)}</h3>
            <ul className="escala-list">
              {usage
                .filter((e) => e.date === d)
                .map((e) => {
                  const pos = positionsMeta(r.forRoomRoles);
                  const picked = e.people.filter((p) => p.via === "person");
                  const byPosition = e.people.length - picked.length;
                  return (
                  <li key={e.eventId} className={`escala-item ${isForWholeTeam(r) ? "" : "escala-item--addable"}`}>
                    {!isForWholeTeam(r) && (
                      <div className="escala-item__corner">
                        <button
                          type="button"
                          className="icon-btn escala-item__corner-btn escala-item__add"
                          title={tx("Escalar alguém como {name} em {title}", { name: r.name, title: e.title })}
                          aria-label={tx("Escalar alguém como {name} em {title}", { name: r.name, title: e.title })}
                          onClick={() => setAddTo(e)}
                        >
                          +
                        </button>
                      </div>
                    )}
                    <span className="escala-item__time">{e.startTime}</span>
                    <div className="escala-item__body">
                      <span className="escala-item__role">
                        {onOpenEvent ? (
                          <button type="button" className="text-link" title={tx("Ver evento {title}", { title: e.title })} onClick={() => onOpenEvent(e.eventId)}>
                            <span aria-hidden="true">{e.emoji}</span> {e.title}
                          </button>
                        ) : (
                          <span className="escala-item__event">
                            <span aria-hidden="true">{e.emoji}</span> {e.title}
                          </span>
                        )}
                        <span className="cat-hint">{e.people.length === 0 ? tx("ninguém ainda") : e.people.length === 1 ? tx("{n} pessoa", { n: e.people.length }) : tx("{n} pessoas", { n: e.people.length })}</span>
                      </span>
                      {(pos || picked.length > 0) && (
                        <div className="staff-card__tags">
                          {pos && (
                            <span className="staff-tag staff-tag--everyone" title={byPosition === 1 ? tx("{n} pessoa: {hint}, sem escalar uma por uma", { n: byPosition, hint: pos.hint }) : tx("{n} pessoas: {hint}, sem escalar uma por uma", { n: byPosition, hint: pos.hint })}>
                              <img className="audience-icon" src={pos.icon} alt="" aria-hidden="true" /> {pos.label}
                              <span className="staff-tag__n">{byPosition}</span>
                            </span>
                          )}
                          {picked.map((p) =>
                            onOpenStaff ? (
                              <button key={p.staffId} type="button" className="staff-tag staff-tag--soft staff-tag--link" title={tx("{name} foi escalado(a) à mão — ver", { name: shownName(p.name) })} onClick={() => onOpenStaff(p.staffId)}>
                                {shownName(p.name)}
                                {p.detail && <span className="staff-tag__n">{p.detail}</span>}
                              </button>
                            ) : (
                              <span key={p.staffId} className="staff-tag staff-tag--soft" title={tx("{name} foi escalado(a) à mão", { name: shownName(p.name) })}>
                                {shownName(p.name)}
                                {p.detail && <span className="staff-tag__n">{p.detail}</span>}
                              </span>
                            ),
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                  );
                })}
            </ul>
          </div>
        ))}
      </section>

      <AssignRoleDialog
        key={addTo?.eventId ?? "none"}
        token={token}
        open={!!addTo}
        entry={{ eventId: addTo?.eventId ?? "", roleId }}
        onClose={() => setAddTo(null)}
        onAssigned={() => {}}
      />
    </div>
  );
}
