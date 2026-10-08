import { useEffect, useState } from "react";
import AssignLeaderDialog from "./AssignLeaderDialog";
import ChangeRoomDialog from "./ChangeRoomDialog";
import CamperHistoryDialog from "./CamperHistoryDialog";
import CamperFieldDialog, { type CamperQuickField } from "./CamperFieldDialog";
import LinkRequestDialog from "./LinkRequestDialog";
import Breadcrumbs from "../../components/Breadcrumbs";
import HealthAlerts, { healthLines, useHealthLabelOf } from "../../components/HealthAlerts";
import HealthEditDialog from "../../components/HealthEditDialog";
import HealthHeart from "../../components/HealthHeart";
import CamperCard from "../../components/CamperCard";
import KidIcon from "../../components/KidIcon";
import PlayScene from "../../components/PlayScene";
import PersonContact from "../../components/PersonContact";
import { ICONS, kidIconSex } from "../../icons";
import BedroomTag from "../../components/BedroomTag";
import { ageOf, type Camper, type CamperRecord, type HealthInfo, type PersonLive } from "../../api/campers";
import ParentIcon from "../../components/ParentIcon";
import GuardianWhatsApp from "../../components/GuardianWhatsApp";
import StaffIcon from "../../components/StaffIcon";
import StaffMiniCard from "../../components/StaffMiniCard";
import TeamTag from "../../components/TeamTag";
import { loadAuth } from "../../auth/store";
import { useCamperLive } from "../../hooks/usePersonData";
import { useCollectionOrEmpty } from "../../store";
import { useCamperDetail, useLabelOf } from "../../store/derive";
import { useNames, nameSettled, unnamedText } from "../../store/people";
import TransportTag from "../../components/TransportTag";
import type { DetailNav } from "./DetailStack";
import { useI18n } from "../../i18n";
import styles from "../../components/campers.module.scss";

/** An emergency-lookup record: camp ops + the name (+ health) the lookup answered. */
export type CamperOverride = CamperRecord & { name: string; health?: HealthInfo | null } & Partial<Omit<PersonLive, "name" | "health">>;

interface CamperDetailProps {
  token: string;
  camperId: string;
  nav: DetailNav;
  /**
   * Emergency QR lookup: the kid may be OUTSIDE the viewer's realtime store.
   * When set, this record (and its health) is shown instead of reading the
   * kid's page (room / caretaker / roommates still join from the store).
   */
  camperOverride?: CamperOverride;
  /** room from the lookup response (out-of-scope kids aren't in the bedrooms store) */
  bedroomOverride?: { id: string; name: string; group: "girls" | "boys" | "staff" } | null;
  /** caretaker from the lookup response (name only) */
  caretakerOverride?: { id: string; name: string } | null;
  /** absent = read-only (care team, or opened from another page): no pencil, no room change */
  onEdit?: (camper: Camper) => void;
  /** the care team (or coordenação) may edit the kid's health block in place — the 🩺 pencil */
  canEditHealth?: boolean;
  onOpenStaff?: (staffId: string) => void;
  onOpenCamper?: (camperId: string) => void;
  onOpenBedroom?: (bedroomId: string) => void;
}

/**
 * One kid: camp operations from the store, the name / health / responsáveis
 * read LIVE from IPAlpha (never stored), the room + its team, and roommates.
 */
export default function CamperDetail({ token, camperId, nav, camperOverride, bedroomOverride, caretakerOverride, onEdit, canEditHealth, onOpenStaff, onOpenCamper, onOpenBedroom }: CamperDetailProps) {
  const { tx } = useI18n();
  const [moveOpen, setMoveOpen] = useState(false);
  const [leaderOpen, setLeaderOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [fieldOpen, setFieldOpen] = useState<CamperQuickField | null>(null);
  const [healthOpen, setHealthOpen] = useState(false);
  const [responsibleOpen, setResponsibleOpen] = useState(false);
  // camp ops joined locally from the store — works offline and updates live
  const data = useCamperDetail(camperId);
  // the kid's page read live: name, health (roles allowed) and responsáveis — an emergency lookup already brought its own
  const live = useCamperLive(token, camperOverride ? null : camperId);
  const bedrooms = useCollectionOrEmpty("bedrooms");
  const staff = useCollectionOrEmpty("staff");
  const labelOf = useLabelOf();
  const healthLabelOf = useHealthLabelOf(token);
  const activeRole = loadAuth()?.user.activeRole;
  const { setTitle } = nav;

  const storeKid = camperOverride ? null : (data?.camper ?? null);
  const k: Camper | null = camperOverride
    ? { ...camperOverride, nickname: camperOverride.nickname ?? null, sex: camperOverride.sex ?? null }
    : storeKid
      ? { ...storeKid, ...(live.data ? { name: live.data.name || storeKid.name, nickname: live.data.nickname, sex: live.data.sex ?? storeKid.sex } : {}) }
      : (live.data ?? null);

  const roomFromStore = k?.bedroom ? bedrooms.find((b) => b.id === k.bedroom) : null;
  const bedroom = camperOverride ? (bedroomOverride ?? (roomFromStore ? { id: roomFromStore.id, name: roomFromStore.name, group: roomFromStore.group } : null)) : (data?.bedroom ?? (roomFromStore ? { id: roomFromStore.id, name: roomFromStore.name, group: roomFromStore.group } : null));
  const caretakerFromStore = k?.caretakerId ? (staff.find((s) => s.id === k.caretakerId) ?? null) : null;
  const caretaker: { id: string; name: string } | null = camperOverride ? (caretakerOverride ?? caretakerFromStore) : (data?.caretaker ?? caretakerFromStore);
  const caretakers = data?.caretakers ?? (k?.bedroom ? staff.filter((s) => s.bedroom === k.bedroom) : []);
  // roommates stay empty on an out-of-scope lookup — we only fetched this one kid
  const roommates = data?.roommates ?? [];

  /** undefined = this role does not see health; null = nothing declared */
  const health: HealthInfo | null | undefined = camperOverride ? camperOverride.health : live.data ? live.data.health : undefined;
  /** core refused this role the kid's health (health: null) — never "nothing declared" */
  const healthForbidden = !camperOverride && !!live.data?.healthForbidden;
  const responsibles = live.data?.responsibles ?? [];
  const nameOf = useNames([...responsibles.map((r) => r.personId), caretaker?.id]);

  useEffect(() => {
    if (k?.name) setTitle(k.name.split(" ")[0]);
  }, [k?.name, setTitle]);

  if (!k) {
    const notFound = (data === undefined && !camperOverride && !live.loading) || !!live.error;
    return (
      <div className="admin-page">
        <Breadcrumbs items={nav.crumbs} />
        {notFound ? <p className="message message--error">{tx("Acampante não encontrado.")}</p> : <p className="opt-empty">{tx("Sincronizando… 🏕️")}</p>}
      </div>
    );
  }

  const age = ageOf(k.birthDate ?? null);
  const sex = kidIconSex(bedroom?.group, k.sex);
  const isCoordination = activeRole === "coordenacao";
  // the health pencil: the care team (in place), or the coordenação on its own page
  const mayEditHealth = (!!canEditHealth || (!!onEdit && isCoordination)) && health !== undefined && !camperOverride && !healthForbidden;
  /** decision 80: the coordenação (the camp role with canRegister) asks the family — never links directly (decision 57) */
  const mayAddResponsible = !!onEdit && isCoordination && !camperOverride;
  const caretakerName = caretaker ? caretaker.name || nameOf(caretaker.id) : "";
  const healthLoading = !camperOverride && live.loading && !live.data;

  const healthBlock = (() => {
    if (healthLoading) return <p className="cat-hint">{tx("Carregando informações de saúde…")}</p>;
    if (health === undefined) return null;
    if (healthForbidden) return <p className="staff-card__alert staff-card__alert--soft">{tx("Não disponível para o seu perfil.")}</p>;
    const hasLines = !!health && healthLines(health, healthLabelOf).length > 0;
    const extras = health && (health.weightKg != null || health.insurance || health.insuranceCard);
    return (
      <div className={styles.healthReveal}>
        <div>
          {hasLines ? <HealthAlerts person={health!} labelOf={healthLabelOf} boxed /> : <p className="staff-card__alert staff-card__alert--soft">{tx("Nada de saúde declarado.")}</p>}
          {extras && (
            <dl className="detail-grid">
              {health!.weightKg != null && (
                <>
                  <dt>{tx("Peso")}</dt>
                  <dd>{tx("{weight} kg", { weight: String(health!.weightKg).replace(".", ",") })}</dd>
                </>
              )}
              {(health!.insurance || health!.insuranceCard) && (
                <>
                  <dt>{tx("Convênio")}</dt>
                  <dd>
                    {health!.insurance || "—"}
                    {health!.insuranceCard && <span className="cat-hint">· {health!.insuranceCard}</span>}
                  </dd>
                </>
              )}
            </dl>
          )}
        </div>
      </div>
    );
  })();

  return (
    <div className="admin-page">
      <Breadcrumbs items={nav.crumbs} />
      <header className="admin-head">
        <h1 className="admin-title detail-title">
          <KidIcon sex={sex} size={40} />
          {k.name || <span className={nameSettled(k.id) ? undefined : styles.pendingName}>{tx(unnamedText(k.id))}</span>}
          <HealthHeart show={health === undefined ? k.hasHealth : false} />
          {age !== null && <span className="kid-card__age">{tx("{age} anos", { age })}</span>}
        </h1>
        {onEdit && (
          <>
            <button type="button" className="icon-btn icon-btn--lg" title={tx("Histórico de alterações")} aria-label={tx("Histórico de alterações")} onClick={() => setHistoryOpen(true)}>
              🕓
            </button>
            <button type="button" className="icon-btn icon-btn--lg" title={tx("Editar")} aria-label={tx("Editar")} onClick={() => onEdit(k)}>
              <span className="pencil" aria-hidden="true">✏️</span>
            </button>
          </>
        )}
      </header>

      <section className="detail-card">
        <dl className="detail-grid">
          <dt>{tx("Líder")}</dt>
          <dd>
            {caretaker ? (
              onOpenStaff ? (
                <button type="button" className="link-btn" title={tx("Ver líder")} onClick={() => onOpenStaff(caretaker.id)}>
                  {caretakerName || tx(unnamedText(caretaker.id))}
                </button>
              ) : (
                caretakerName || tx(unnamedText(caretaker.id))
              )
            ) : k.caretakerId ? (
              "—"
            ) : (
              <span className="orphan-tag">⚠️ {tx("Sem líder")}</span>
            )}
            {onEdit && (
              <button type="button" className="icon-btn icon-btn--bare" title={caretaker ? tx("Trocar líder") : tx("Escolher líder")} aria-label={caretaker ? tx("Trocar líder") : tx("Escolher líder")} onClick={() => setLeaderOpen(true)}>
                <img className="pencil-icon" src={ICONS.pencil} alt="" aria-hidden="true" />
              </button>
            )}
          </dd>
          <dt>{tx("Time")}</dt>
          <dd>
            <TeamTag teamId={k.team} fallback="—" />
            {onEdit && (
              <button type="button" className="icon-btn icon-btn--bare" title={tx("Trocar de time")} aria-label={tx("Trocar de time")} onClick={() => setFieldOpen("team")}>
                <img className="pencil-icon" src={ICONS.pencil} alt="" aria-hidden="true" />
              </button>
            )}
          </dd>
          <dt>{tx("Quarto")}</dt>
          <dd>
            {bedroom ? <BedroomTag bedroom={bedroom} onClick={onOpenBedroom ? () => onOpenBedroom(bedroom.id) : undefined} /> : "—"}
            {onEdit && (
              <button type="button" className="icon-btn icon-btn--bare" title={tx("Trocar de quarto / líder")} aria-label={tx("Trocar de quarto ou líder")} onClick={() => setMoveOpen(true)}>
                <img className="pencil-icon" src={ICONS.pencil} alt="" aria-hidden="true" />
              </button>
            )}
            {labelOf(k.bed) && <span className="staff-tag">{tx("Cama {bed}", { bed: labelOf(k.bed)!.toLowerCase() })}</span>}
          </dd>
          <dt>{tx("Transporte")}</dt>
          <dd>
            {k.transportation ? <TransportTag transportId={k.transportation} /> : "—"}
            {onEdit && (
              <button type="button" className="icon-btn icon-btn--bare" title={tx("Trocar o transporte")} aria-label={tx("Trocar o transporte")} onClick={() => setFieldOpen("transportation")}>
                <img className="pencil-icon" src={ICONS.pencil} alt="" aria-hidden="true" />
              </button>
            )}
          </dd>
          {k.bedroomPreference && (
            <>
              <dt>{tx("Quer ficar com")}</dt>
              <dd>{k.bedroomPreference}</dd>
            </>
          )}
          {k.invitedBy && (
            <>
              <dt>{tx("Convidado por")}</dt>
              <dd>{k.invitedBy}</dd>
            </>
          )}
        </dl>
        {(health !== undefined || healthLoading) && (
          <div className="detail-health">
            <div className="detail-health__head">
              <h3 className="detail-health__title">{tx("🩺 Saúde")}</h3>
              {mayEditHealth && (
                <button type="button" className="icon-btn icon-btn--bare" title={tx("Editar saúde")} aria-label={tx("Editar saúde")} onClick={() => setHealthOpen(true)}>
                  <img className="pencil-icon" src={ICONS.pencil} alt="" aria-hidden="true" />
                </button>
              )}
            </div>
            {healthBlock}
          </div>
        )}
        {k.generalNotes && (
          <p className="detail-note">
            📝 {k.generalNotes}
          </p>
        )}
      </section>

      {/* the family: names from IPAlpha, contacts read only on tap (LGPD) — no section on an out-of-scope emergency lookup */}
      {!k.redacted && !camperOverride && (responsibles.length > 0 || mayAddResponsible || live.loading) && (
        <section className="detail-section">
          <h2 className="detail-h2">
            <ParentIcon size={24} /> {responsibles.length > 1 ? tx("Responsáveis") : tx("Responsável")}
          </h2>
          <div className="detail-card">
            {live.loading && !live.data && <p className="cat-hint">{tx("Carregando…")}</p>}
            {live.data && responsibles.length === 0 && <p className="cat-hint">{tx("Nenhum responsável cadastrado ainda.")}</p>}
            {responsibles.length > 0 && (
              <ul className={styles.responsibles}>
                {responsibles.map((r) => {
                  const rName = r.name || nameOf(r.personId);
                  return (
                    <li key={r.personId} className={styles.responsible}>
                      <span className={`${styles.responsibleName} ${rName || nameSettled(r.personId) ? "" : styles.pendingName}`}>{rName || tx(unnamedText(r.personId))}</span>
                      <PersonContact token={token} personId={r.personId} name={rName} about={k.name} />
                    </li>
                  );
                })}
              </ul>
            )}
            {mayAddResponsible && (
              <button type="button" className={`button button--secondary button--small ${styles.addResponsible}`} onClick={() => setResponsibleOpen(true)}>
                + {tx("Adicionar outro responsável")}
              </button>
            )}
          </div>
        </section>
      )}

      <section className="detail-section">
        <h2 className="detail-h2">
          <StaffIcon size={24} /> {tx("Equipe no quarto")} <span className="cat-tab__count">{caretakers.length}</span>
        </h2>
        {!bedroom && <p className="opt-empty">{tx("Sem quarto definido.")}</p>}
        {bedroom && caretakers.length === 0 && <p className="opt-empty">⚠️ {tx("Ninguém da equipe no quarto {name}.", { name: bedroom.name })}</p>}
        {caretakers.length > 0 && (
          <ul className="staff-list">
            {caretakers.map((s) => (
              <StaffMiniCard key={s.id} staff={s} labelOf={labelOf} onOpen={onOpenStaff} />
            ))}
          </ul>
        )}
      </section>

      {bedroom && (
        <section className="detail-section">
          <h2 className="detail-h2">
            <KidIcon sex={sex} group size={26} /> {tx("No mesmo quarto")} <BedroomTag bedroom={bedroom} /> <span className="cat-tab__count">{roommates.length}</span>
          </h2>
          {roommates.length === 0 ? (
            <p className="opt-empty">{tx("Sozinho(a) no quarto por enquanto.")}</p>
          ) : (
            <ul className="kid-list">
              {roommates.map((r) => (
                <CamperCard key={r.id} camper={r} labelOf={labelOf} hideBedroom onOpen={onOpenCamper} corner={<GuardianWhatsApp camper={r} />} />
              ))}
            </ul>
          )}
        </section>
      )}

      {onEdit && <ChangeRoomDialog token={token} open={moveOpen} camper={k} onClose={() => setMoveOpen(false)} />}
      {onEdit && <AssignLeaderDialog token={token} open={leaderOpen} camper={k} onClose={() => setLeaderOpen(false)} />}
      {onEdit && fieldOpen && <CamperFieldDialog token={token} open camper={k} field={fieldOpen} onClose={() => setFieldOpen(null)} />}
      {onEdit && <CamperHistoryDialog token={token} open={historyOpen} camperId={k.id} camperName={k.name} onClose={() => setHistoryOpen(false)} />}
      {mayAddResponsible && <LinkRequestDialog token={token} open={responsibleOpen} camperId={k.id} camperName={k.name} onClose={() => setResponsibleOpen(false)} />}
      {/* mounted only while open, so it starts from the health read just now */}
      {mayEditHealth && healthOpen && <HealthEditDialog token={token} open camperId={k.id} name={k.name} health={health ?? null} onClose={() => setHealthOpen(false)} onSaved={() => live.reload()} />}
      <PlayScene sex={sex} />
    </div>
  );
}
