import { useEffect, useState } from "react";
import Breadcrumbs from "../../components/Breadcrumbs";
import HealthAlerts from "../../components/HealthAlerts";
import InstructionsDialog from "../../components/InstructionsDialog";
import KidIcon, { AdultIcon } from "../../components/KidIcon";
import { ICONS, kidSexOf } from "../../icons";
import BedroomTag from "../../components/BedroomTag";
import { useCampTiming } from "../../campPhase";
import { unassignStaff } from "../../api/schedule";
import { speakDay, speakStamp } from "../../dates";
import AssignRoleDialog from "./AssignRoleDialog";
import {
  ROOM_ROLE_META,
  staffSex,
  type Staff,
  type StaffScheduleItem,
} from "../../api/staff";
import MoveStaffDialog from "./MoveStaffDialog";
import StaffFieldDialog, { type StaffQuickField } from "./StaffFieldDialog";
import CamperCard from "../../components/CamperCard";
import HealthHeart from "../../components/HealthHeart";
import PersonContact from "../../components/PersonContact";
import RoomRoleIcon from "../../components/RoomRoleIcon";
import TeamTag from "../../components/TeamTag";
import { useLabelOf, useStaffDetail } from "../../store/derive";
import { useNames } from "../../store/people";
import { useHealthLabel, useStaffLive } from "../../hooks/usePersonData";
import TransportTag from "../../components/TransportTag";
import type { CamperCheckin } from "../../api/campers";
import type { DetailNav } from "./DetailStack";
import { useI18n } from "../../i18n";
import { firstNameOf, shownName } from "./staffNames";
import css from "./staffGroup.module.scss";

/**
 * Who stamped it, as the sentence reads: "por Ana" (recorded by Ana),
 * "para Ana" (the vest was returned TO Ana), or "pelo próprio celular" when
 * the person did it themself (self check-in). Names are read live by id.
 */
function stampBy(
  c: Pick<CamperCheckin, "byPersonId">,
  selfId: string,
  nameOf: (id: string) => string,
  tx: (pt: string, vars?: Record<string, string | number>) => string,
  prep: "por" | "para" = "por",
): string {
  if (!c.byPersonId) return "";
  if (c.byPersonId === selfId) return tx("pelo próprio celular");
  const name = firstNameOf(nameOf(c.byPersonId));
  return prep === "para" ? tx("para {name}", { name }) : tx("por {name}", { name });
}

interface StaffDetailProps {
  token: string;
  staffId: string;
  nav: DetailNav;
  /** absent = read-only (organizers, or opened from the programme): no pencil */
  onEdit?: (member: Staff) => void;
  onOpenStaff?: (staffId: string) => void;
  onOpenCamper?: (camperId: string) => void;
  onOpenBedroom?: (bedroomId: string) => void;
  onOpenRole?: (roleId: string) => void;
  onOpenEvent?: (eventId: string) => void;
}

/** One volunteer: info, the specific functions they are linked to (with instructions) and the kids in their room. */
export default function StaffDetail({
  token,
  staffId,
  nav,
  onEdit,
  onOpenStaff,
  onOpenCamper,
  onOpenBedroom,
  onOpenRole,
  onOpenEvent,
}: StaffDetailProps) {
  const { tx, te } = useI18n();
  // joined locally from the store — works offline and updates live (no reload needed after (un)assigning)
  const data = useStaffDetail(staffId);
  const [actionError, setError] = useState<string | null>(null);
  const error = data === undefined ? tx("Pessoa não encontrada.") : actionError;
  /** the schedule item whose instructions are open in the dialog */
  const [instructionsFor, setInstructionsFor] =
    useState<StaffScheduleItem | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [fieldOpen, setFieldOpen] = useState<StaffQuickField | null>(null);
  const [busy, setBusy] = useState(false);
  const labelOf = useLabelOf();
  // health is never in the store: read live from IPAlpha for this page (the person themself / managers)
  const live = useStaffLive(token, staffId);
  const healthLabel = useHealthLabel(token);
  const healthLabelOf = (id: string | null | undefined) => (id ? healthLabel(id) || labelOf(id) : null);
  const stampIds = data ? [data.staff.checkin?.byPersonId, data.staff.vest?.delivered?.byPersonId, data.staff.vest?.returned?.byPersonId] : [];
  const nameOf = useNames(stampIds);
  const { endsAt } = useCampTiming();
  /** the camp is over: an unreturned vest is a problem */
  const campOver = endsAt !== null && Date.now() >= endsAt;
  const [vestOpen, setVestOpen] = useState(false);
  const reload = () => {};
  const { setTitle } = nav;
  useEffect(() => {
    if (data) setTitle(firstNameOf(data.staff.name));
  }, [data, setTitle]);

  /** desvincular é um clique só — é fácil de refazer, não pede confirmação */
  async function handleUnassign(x: StaffScheduleItem) {
    const eventId = x.eventId;
    setBusy(true);
    try {
      await unassignStaff(token, eventId, staffId);
      reload();
    } catch (e) {
      setError(te(e, "Algo deu errado."));
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <div className="admin-page">
        <Breadcrumbs items={nav.crumbs} />
        {error ? (
          <p className="message message--error">{error}</p>
        ) : (
          <p className="opt-empty">{tx("Sincronizando… 🏕️")}</p>
        )}
      </div>
    );
  }

  const {
    staff: s,
    bedroom,
    schedule,
    campers,
    otherCampers,
    roommates,
  } = data;
  const explicit = schedule.filter((x) => !x.implicit);
  const firstName = firstNameOf(s.name);
  const health = live.data?.health ?? null;
  const roommateById = new Map(roommates.map((r) => [r.id, r]));
  /** leaders (caretakers) of the OTHER kids of the room, with how many each one looks after */
  const otherLeaders = [
    ...otherCampers.reduce(
      (m, k) =>
        k.caretakerId
          ? m.set(k.caretakerId, (m.get(k.caretakerId) ?? 0) + 1)
          : m,
      new Map<string, number>(),
    ),
  ]
    .map(([id, n]) => ({ staff: roommateById.get(id), n }))
    .filter((x): x is { staff: Staff; n: number } => !!x.staff);
  const otherOrphans = otherCampers.filter(
    (k) => !k.caretakerId || !roommateById.has(k.caretakerId),
  ).length;
  const vestReturned = !!s.vest?.delivered && !!s.vest.returned;
  const vestLate = campOver && !vestReturned;
  const adultIcon = staffSex(s, bedroom ? [bedroom] : []) === "M" ? "man" : "woman";

  /** "Cleves (auxiliar) está no mesmo quarto: 403 (Meninos)" — the colleagues and the room are links */
  const roomSentence = bedroom && (
    <p className="admin-intro">
      {roommates.length > 0 ? (
        <>
          {roommates.map((r, i) => (
            <span key={r.id}>
              {i > 0 && (i === roommates.length - 1 ? tx(" e ") : ", ")}
              {onOpenStaff ? (
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => onOpenStaff(r.id)}
                >
                  {firstNameOf(r.name)}
                </button>
              ) : (
                <strong>{firstNameOf(r.name)}</strong>
              )}
              {bedroom.group !== "staff" && ` (${tx(ROOM_ROLE_META[r.roomRole].label).toLowerCase()})`}
            </span>
          ))}{" "}
          {roommates.length === 1 ? tx("está") : tx("estão")} {tx("no mesmo quarto:")}
        </>
      ) : (
        <>
          <strong>{firstName}</strong> {tx("é a única pessoa da equipe no quarto:")}
        </>
      )}{" "}
      <BedroomTag bedroom={bedroom} onClick={onOpenBedroom ? () => onOpenBedroom(bedroom.id) : undefined} />
    </p>
  );

  return (
    <div className="admin-page">
      <Breadcrumbs items={nav.crumbs} />
      <header className="admin-head">
        <h1 className="admin-title detail-title">
          <AdultIcon sex={adultIcon} size={40} />
          {shownName(s.name)}
          <HealthHeart show={s.hasHealth ?? live.data?.hasHealth} />
          {!s.active && <span className="staff-card__inactive">{tx("inativo")}</span>}
        </h1>
        {onEdit && (
          <button
            type="button"
            className="icon-btn icon-btn--lg"
            title={tx("Editar")}
            aria-label={tx("Editar")}
            onClick={() => onEdit(s)}
          >
            <span className="pencil" aria-hidden="true">
              ✏️
            </span>
          </button>
        )}
      </header>

      {/* ── info ── */}
      <section className="detail-card">
        <dl className="detail-grid">
          {/* the phone lives in IPAlpha: read only when someone taps (core's role rules decide, the read is logged) */}
          <dt>{tx("Contato")}</dt>
          <dd>
            <PersonContact token={token} personId={s.id} name={s.name} />
          </dd>
          <dt>{tx("Time")}</dt>
          <dd>
            {/* an admin is on the roster for the room / transport / vest only: no time, no kids */}
            <TeamTag teamId={s.team} fallback="—" />
            {onEdit && (
              <button type="button" className="icon-btn icon-btn--bare" title={tx("Trocar de time")} aria-label={tx("Trocar de time")} onClick={() => setFieldOpen("team")}>
                <img className="pencil-icon" src={ICONS.pencil} alt="" aria-hidden="true" />
              </button>
            )}
          </dd>
          <dt>{tx("Quarto")}</dt>
          <dd>
            {bedroom ? (
              <BedroomTag bedroom={bedroom} onClick={onOpenBedroom ? () => onOpenBedroom(bedroom.id) : undefined} />
            ) : (
              "—"
            )}
            {onEdit && (
              <button
                type="button"
                className="icon-btn icon-btn--bare"
                title={tx("Trocar de quarto")}
                aria-label={tx("Trocar de quarto")}
                onClick={() => setMoveOpen(true)}
              >
                <img className="pencil-icon" src={ICONS.pencil} alt="" aria-hidden="true" />
              </button>
            )}
            {bedroom && bedroom.group !== "staff" && (
              <span
                className="staff-tag"
                title={tx(ROOM_ROLE_META[s.roomRole].hint)}
              >
                <RoomRoleIcon role={s.roomRole} sex={staffSex(s, bedroom ? [bedroom] : [])} /> {tx(ROOM_ROLE_META[s.roomRole].label)}
              </span>
            )}
          </dd>
          <dt>{tx("Transporte")}</dt>
          <dd>
            {s.transportation ? <TransportTag transportId={s.transportation} /> : "—"}
            {onEdit && (
              <button type="button" className="icon-btn icon-btn--bare" title={tx("Trocar o transporte")} aria-label={tx("Trocar o transporte")} onClick={() => setFieldOpen("transportation")}>
                <img className="pencil-icon" src={ICONS.pencil} alt="" aria-hidden="true" />
              </button>
            )}
          </dd>
          {!s.redacted && (
            <>
              <dt>{tx("Check-in")}</dt>
              <dd>
                {s.checkin
                  ? `✅ ${speakStamp(s.checkin.at)} · ${stampBy(s.checkin, s.id, nameOf, tx)}`
                  : tx("Ainda não chegou")}
              </dd>
              {s.vest?.delivered && (
                <>
                  <dt>{tx("Colete")}</dt>
                  <dd>
                    <span
                      className={
                        vestLate
                          ? "vest-status vest-status--late"
                          : "vest-status"
                      }
                    >
                      {vestReturned ? tx("Devolvido") : tx("Não devolvido")}
                    </span>
                    <button
                      type="button"
                      className={`icon-btn icon-btn--bare vest-toggle ${vestOpen ? "vest-toggle--open" : ""}`}
                      title={vestOpen ? tx("Ocultar detalhes") : tx("Ver detalhes")}
                      aria-label={
                        vestOpen
                          ? tx("Ocultar detalhes do colete")
                          : tx("Ver detalhes do colete")
                      }
                      aria-expanded={vestOpen}
                      onClick={() => setVestOpen((v) => !v)}
                    >
                      <span className="disclosure__arrow" aria-hidden="true">
                        ▶
                      </span>
                    </button>
                    {vestOpen && (
                      <small className="vest-details">
                        {tx("🦺 Entregue {when} · {by}", { when: speakStamp(s.vest.delivered.at), by: stampBy(s.vest.delivered, s.id, nameOf, tx) })}
                        {s.vest.returned && (
                          <>
                            <br />{tx("✅ Devolvido {when} · {by}", { when: speakStamp(s.vest.returned.at), by: stampBy(s.vest.returned, s.id, nameOf, tx, "para") })}
                          </>
                        )}
                      </small>
                    )}
                  </dd>
                </>
              )}
            </>
          )}
        </dl>
        <div>
          {health && (
            <div className={css.healthLive}>
              <HealthAlerts person={health} labelOf={healthLabelOf} boxed />
            </div>
          )}
          {live.loading && s.hasHealth && <p className="cat-hint">{tx("Carregando informações de saúde…")}</p>}
          {live.error && s.hasHealth && <p className="cat-hint">{tx("Não foi possível ler as informações de saúde agora.")}</p>}
        </div>
      </section>

      {/* ── functions (explicit assignments only) ── */}
      <section className="detail-section">
        <div className="detail-h2-row">
          <h2 className="detail-h2">
            🎯 {tx("Funções")} <span className="cat-tab__count">{explicit.length}</span>
          </h2>
          <button
            type="button"
            className="button button--primary admin-head__new"
            onClick={() => setAssignOpen(true)}
          >
            {tx("+ Vincular função")}
          </button>
        </div>
        {explicit.length === 0 && (
          <p className="opt-empty">{tx("Nenhuma função específica.")}</p>
        )}
        {explicit.length > 0 && (
          <ul className="escala-list">
            {explicit.map((x) => {
              const key = x.eventId;
              return (
                <li key={key} className="escala-item escala-item--removable">
                  <span className="escala-item__corner">
                    {x.role?.instructions && (
                      <button
                        type="button"
                        className="icon-btn escala-item__corner-btn"
                        title={tx("Ver instruções")}
                        aria-label={tx("Ver instruções de {name}", { name: x.role.name })}
                        onClick={() => setInstructionsFor(x)}
                      >
                        📝
                      </button>
                    )}
                    <button
                      type="button"
                      className="icon-btn icon-btn--danger escala-item__corner-btn"
                      title={tx("Desvincular função")}
                      aria-label={tx("Desvincular {role} em {title}", { role: x.role?.name ?? tx("Função"), title: x.title })}
                      disabled={busy}
                      onClick={() => handleUnassign(x)}
                    >
                      ✕
                    </button>
                  </span>
                  <span className="escala-item__time">
                    <span className="escala-item__date">
                      {speakDay(x.date, "weekday")}
                    </span>
                    {x.startTime}
                  </span>
                  <div className="escala-item__body">
                    <p className="escala-item__line">
                      {x.role && onOpenRole ? (
                        <button
                          type="button"
                          className="text-link"
                          title={tx("Ver função {name}", { name: x.role.name })}
                          onClick={() => onOpenRole(x.role!.id)}
                        >
                          {x.role.emoji} {x.role.name}
                        </button>
                      ) : (
                        <strong>
                          {x.role?.emoji} {x.role?.name ?? "?"}
                        </strong>
                      )}
                      {x.detail && (
                        <span className="staff-tag__n">{x.detail}</span>
                      )}
                      <span className="escala-item__prep">{tx(" em ")}</span>
                      {onOpenEvent ? (
                        <button
                          type="button"
                          className="text-link"
                          title={tx("Ver evento {title}", { title: x.title })}
                          onClick={() => onOpenEvent(x.eventId)}
                        >
                          <span aria-hidden="true">{x.emoji}</span> {x.title}
                        </button>
                      ) : (
                        <strong>
                          <span aria-hidden="true">{x.emoji}</span> {x.title}
                        </strong>
                      )}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <AssignRoleDialog
        token={token}
        entry={{ staff: s }}
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        onAssigned={reload}
      />
      {onEdit && (
        <MoveStaffDialog
          token={token}
          open={moveOpen}
          member={s}
          onClose={() => setMoveOpen(false)}
        />
      )}
      {onEdit && fieldOpen && <StaffFieldDialog token={token} open member={s} field={fieldOpen} onClose={() => setFieldOpen(null)} />}
      <InstructionsDialog
        role={instructionsFor?.role ?? null}
        context={
          instructionsFor
            ? tx("em {emoji} {title} · {when}", {
                emoji: instructionsFor.emoji,
                title: instructionsFor.title,
                when: `${speakDay(instructionsFor.date, "weekday")} ${instructionsFor.startTime}`,
              })
            : undefined
        }
        onClose={() => setInstructionsFor(null)}
      />

      {/* ── kids ── */}
      <section className="detail-section">
        <h2 className="detail-h2">
          <KidIcon
            sex={kidSexOf(bedroom?.group)}
            group={!!kidSexOf(bedroom?.group)}
            size={26}
          />{" "}
          {s.roomRole === "caretaker"
            ? tx("Crianças sob responsabilidade")
            : tx("Crianças do quarto")}{" "}
          <span className="cat-tab__count">{campers.length}</span>
        </h2>
        {!bedroom && (
          <p className="opt-empty">
            {tx("Sem quarto definido — nenhuma criança vinculada.")}
          </p>
        )}
        {bedroom && bedroom.group === "staff" && (
          <p className="opt-empty">{tx("Quarto da equipe — sem crianças.")}</p>
        )}
        {bedroom && bedroom.group !== "staff" && campers.length === 0 && (
          <p className="opt-empty">{tx("Nenhuma criança neste quarto ainda.")}</p>
        )}
        {campers.length > 0 && (
          <>
            {roomSentence}
            <ul className="kid-list">
              {campers.map((k) => (
                <CamperCard
                  key={k.id}
                  camper={k}
                  labelOf={labelOf}
                  hideBedroom
                  onOpen={onOpenCamper}
                />
              ))}
            </ul>
          </>
        )}
      </section>

      {/* ── the other kids of the room (a caretaker only: the ones under a colleague's care) ── */}
      {s.roomRole === "caretaker" &&
        bedroom &&
        bedroom.group !== "staff" &&
        otherCampers.length > 0 && (
          <section className="detail-section">
            <h2 className="detail-h2">
              <KidIcon sex={kidSexOf(bedroom.group)} group size={26} /> {tx("Outras crianças do quarto")}{" "}
              <span className="cat-tab__count">{otherCampers.length}</span>
            </h2>
            <p className="admin-intro">
              {otherLeaders.length > 0 && (
                <>
                  {otherLeaders.length === 1 ? tx("Líder: ") : tx("Líderes: ")}
                  {otherLeaders.map(({ staff: r, n }, i) => (
                    <span key={r.id}>
                      {i > 0 && (i === otherLeaders.length - 1 ? tx(" e ") : ", ")}
                      {onOpenStaff ? (
                        <button
                          type="button"
                          className="link-btn"
                          onClick={() => onOpenStaff(r.id)}
                        >
                          {firstNameOf(r.name)}
                        </button>
                      ) : (
                        <strong>{firstNameOf(r.name)}</strong>
                      )}
                      {otherLeaders.length > 1 && ` (${n})`}
                    </span>
                  ))}
                  .
                </>
              )}
              {otherOrphans > 0 && (
                <span className="orphan-tag">
                  {otherLeaders.length > 0 ? " " : ""}{tx("⚠️ {count} sem líder", { count: otherOrphans })}
                </span>
              )}
            </p>
            <ul className="kid-list">
              {otherCampers.map((k) => (
                <CamperCard
                  key={k.id}
                  camper={k}
                  labelOf={labelOf}
                  hideBedroom
                  onOpen={onOpenCamper}
                />
              ))}
            </ul>
          </section>
        )}
    </div>
  );
}
