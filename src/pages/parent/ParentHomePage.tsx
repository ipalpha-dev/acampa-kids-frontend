import { useEffect, useMemo, useState, type ReactNode } from "react";
import BedroomTag from "../../components/BedroomTag";
import { EMPTY_HEALTH, type Camper, type HealthInfo } from "../../api/campers";
import { staffSex, type Staff } from "../../api/staff";
import CamperQr from "../../components/CamperQr";
import HealthAlerts from "../../components/HealthAlerts";
import KidIcon from "../../components/KidIcon";
import ParentKidTabs from "../../components/ParentKidTabs";
import PersonContact from "../../components/PersonContact";
import PlayScene from "../../components/PlayScene";
import HealthIcon from "../../components/HealthIcon";
import StaffIcon from "../../components/StaffIcon";
import RoomRoleIcon from "../../components/RoomRoleIcon";
import TeamTag from "../../components/TeamTag";
import { useCamperLive, useHealthLabel } from "../../hooks/usePersonData";
import type { ParentAccess } from "../../hooks/useParentWindow";
import { kidIconSex } from "../../icons";
import { parentHomeIntroLiteral, teamLookingAfterLiteral } from "../../parentCopy";
import { useCollection, useCollectionOrEmpty } from "../../store";
import { useNames } from "../../store/people";
import type { LoggedUser } from "../../roles";
import { useLabelOf, useParentHome, type MyKid } from "../../store/derive";
import TransportTag from "../../components/TransportTag";
import AttentionEditDialog from "./AttentionEditDialog";
import CheckinQrDialog from "./CheckinQrDialog";
import { speakWhen } from "../../dates";
import { useI18n } from "../../i18n";
import styles from "../../styles/ops.module.scss";

interface ParentHomePageProps {
  user: LoggedUser;
  token: string;
  access: ParentAccess;
}

/** A name read live from IPAlpha: a gentle placeholder until it arrives, never a blank line. */
const shown = (name: string) => name || "…";

/** Compact chip: important contacts sit in one stretching row. The phone is read only on tap. */
function ImportantContact({ token, personId, name, title }: { token: string; personId: string; name: string; title?: ReactNode }) {
  return (
    <li className="parent-chip">
      <div className="parent-chip__body">
        {title && <p className="parent-contact__title">{title}</p>}
        <h3 className="staff-card__name">{shown(name)}</h3>
      </div>
      <PersonContact token={token} personId={personId} name={name} compact />
    </li>
  );
}

/** Full-width card for the kid's room team — same padding as the identity card. The phone is read only on tap. */
function TeamContact({ token, staff: s, title, about }: { token: string; staff: Staff; title?: ReactNode; about?: string }) {
  return (
    <li className="parent-team-card">
      <div className="parent-team-card__body">
        {title && <p className="parent-contact__title">{title}</p>}
        <h3 className="staff-card__name">{shown(s.name)}</h3>
      </div>
      <PersonContact token={token} personId={s.id} name={s.name} about={about} />
    </li>
  );
}

/** "Informações de saúde": read live from IPAlpha (the responsável's own kid), edited in AttentionEditDialog. */
function KidHealth({ token, kid, reviewing }: { token: string; kid: Camper; reviewing: boolean }) {
  const { tx } = useI18n();
  const live = useCamperLive(token, kid.id);
  const healthLabel = useHealthLabel(token);
  const labelOf = (id: string | null | undefined) => (id ? healthLabel(id) || null : null);
  const [editing, setEditing] = useState(false);
  /** IPAlpha did not let this profile read the kid's health: never shown as "nothing informed" */
  const forbidden = !!live.data?.healthForbidden;
  const h: HealthInfo | null = live.data && !forbidden ? { ...EMPTY_HEALTH, ...(live.data.health ?? {}) } : null;
  const first = (kid.name || live.data?.name || "").split(" ")[0] || tx("sua criança");
  const notes = live.data?.generalNotes ?? kid.generalNotes;
  const empty = h && !h.allergies.length && !h.drugAllergies.length && !h.healthIssues.length && !h.medications.length && !h.foodRestrictions && !h.healthNotes;

  return (
    <div className="detail-section">
      <div className="detail-h2-row">
        <h3 className="detail-h2"><HealthIcon size={24} /> {tx("Informações de saúde")}</h3>
        <button type="button" className="button button--edit" disabled={!h} onClick={() => setEditing(true)}>
          <span className="pencil" aria-hidden="true">✏️</span> {tx("Editar")}
        </button>
      </div>
      <div className={`detail-card ${styles.reveal} ${reviewing ? "camper-ai-observation" : ""}`} title={reviewing ? tx("Este campo está sendo revisado pela IA") : undefined}>
        {!h ? (
          forbidden ? (
            <p className="cat-hint">{tx("As informações de saúde de {name} não estão disponíveis para o seu perfil agora. Se precisar, fale com a coordenação — ela pode ajudar.", { name: first })}</p>
          ) : live.error ? (
            <p className="cat-hint">
              {tx("Não conseguimos ler as informações de saúde agora.")}{" "}
              <button type="button" className="link-btn" onClick={live.reload}>{tx("Tentar de novo")}</button>
            </p>
          ) : (
            <p className={`cat-hint ${styles.loading}`}>{tx("Carregando…")}</p>
          )
        ) : (
          <>
            <dl className="detail-grid">
              <dt>{tx("Peso")}</dt>
              <dd>{h.weightKg != null ? tx("{weight} kg", { weight: String(h.weightKg).replace(".", ",") }) : "—"}</dd>
              <dt>{tx("Convênio")}</dt>
              <dd>
                {h.insurance || "—"}
                {h.insuranceCard && <span className="cat-hint">{tx("· carteirinha {n}", { n: h.insuranceCard })}</span>}
              </dd>
            </dl>
            <HealthAlerts person={h} labelOf={labelOf} boxed />
            {empty && <p className="cat-hint">{tx("Nenhuma alergia, condição ou medicação informada.")}</p>}
          </>
        )}
        <p className="detail-note">📝 {notes || (reviewing ? tx("Observações em revisão pela IA…") : <em className="staff-card__missing">{tx("sem observações")}</em>)}</p>
      </div>
      {editing && h && (
        <AttentionEditDialog
          token={token}
          open
          camper={kid}
          health={h}
          generalNotes={notes}
          onSaved={live.reload}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}

/** One kid: camp data, the team looking after them, the "Informações de saúde" block and the QR code. */
function KidSection({ kid, token, showTeam }: { kid: MyKid; token: string; showTeam: boolean }) {
  const { tx } = useI18n();
  const { camper: k, bedroom, caretaker, roomStaff } = kid;
  const labelOf = useLabelOf();
  const bedrooms = useCollectionOrEmpty("bedrooms");
  const sex = kidIconSex(bedroom?.group, k.sex);
  const first = k.name.split(" ")[0] || tx("sua criança");
  const bedLabel = labelOf(k.bed);
  const reviewing = k.aiReviewStatus === "pending" || k.aiReviewStatus === "processing" || k.aiReviewStatus === "structured";

  return (
    <section className="detail-section parent-kid">
      <header className="admin-head">
        <h2 className="admin-title detail-title">
          <KidIcon sex={sex} size={40} />
          <span className="parent-kid__identity">
            <span className="parent-kid__name">{shown(k.name)}</span>
          </span>
          <span className="parent-kid__break" aria-hidden="true" />
          {k.checkin && <span className="parent-kid__status staff-tag staff-tag--here">{tx("✅ check-in feito")}</span>}
        </h2>
      </header>

      <div className="detail-card">
        <dl className="detail-grid">
          <dt>{tx("Time")}</dt>
          <dd>
            <TeamTag teamId={k.team} fallback="—" />
          </dd>
          <dt>{tx("Quarto")}</dt>
          <dd>
            {bedroom ? <BedroomTag bedroom={bedroom} /> : "—"}
            {bedLabel && <span className="staff-tag">{tx("Cama {bed}", { bed: bedLabel.toLowerCase() })}</span>}
          </dd>
          <dt>{tx("Transporte")}</dt>
          <dd>{k.transportation ? <TransportTag transportId={k.transportation} /> : "—"}</dd>
          <dt>{tx("Líder")}</dt>
          <dd>{showTeam ? (caretaker ? <><RoomRoleIcon role="caretaker" sex={staffSex(caretaker, bedrooms)} /> {shown(caretaker.name)}</> : "—") : <em className="staff-card__missing">{tx("disponível a partir do check-in")}</em>}</dd>
        </dl>
      </div>

      {showTeam && (
        <div className="detail-section">
          <h3 className="detail-h2">
            <StaffIcon size={24} /> {tx(teamLookingAfterLiteral(sex), { name: first })}
          </h3>
          {!caretaker && roomStaff.length === 0 ? (
            <p className="opt-empty">{tx("A equipe do quarto ainda não foi definida.")}</p>
          ) : (
            <ul className="parent-team">
              {caretaker && <TeamContact token={token} staff={caretaker} title={<><RoomRoleIcon role="caretaker" sex={staffSex(caretaker, bedrooms)} /> {tx("Líder de {name}", { name: first })}</>} about={k.name} />}
              {roomStaff.map((s) => (
                <TeamContact key={s.id} token={token} staff={s} title={bedroom ? tx("Equipe do quarto {name}", { name: bedroom.name }) : tx("Equipe do quarto")} about={k.name} />
              ))}
            </ul>
          )}
        </div>
      )}

      <KidHealth token={token} kid={k} reviewing={reviewing} />

      <div className="detail-section parent-qr">
        <h3 className="detail-h2">{tx("🎟️ QR code de {name}", { name: first })}</h3>
        <p className="admin-intro">{tx("Mostre à equipe na entrada do acampamento para o check-in.")}</p>
        <CamperQr camperId={k.id} name={k.name} />
      </div>
    </section>
  );
}

/**
 * "Início" for a PARENT: the important contacts — always, for as long as the
 * parent may use the app — then the selected kid: camp data, the team
 * looking after them (parents' window only), the editable "Informações de saúde"
 * (read live from IPAlpha) and the QR code. Before the check-in starts and
 * after the last event the ROOM TEAM is not sent by the server; the contacts
 * are. Phones are never in the records: each one is read on tap.
 */
export default function ParentHomePage({ user, token, access }: ParentHomePageProps) {
  const { tx } = useI18n();
  const data = useParentHome();
  const settings = useCollection("settings");
  const contacts = useMemo(() => settings?.parentContacts ?? [], [settings]);
  const nameOf = useNames(contacts.map((c) => c.personId));
  const first = user.name.split(" ")[0];
  const [selectedKidId, setSelectedKidId] = useState<string | null>(null);

  useEffect(() => {
    if (!data?.kids.length) return;
    if (!selectedKidId || !data.kids.some((kid) => kid.camper.id === selectedKidId)) {
      setSelectedKidId(data.kids[0].camper.id);
    }
  }, [data, selectedKidId]);

  const hello = first ? tx("Olá, {name}! 👋", { name: first }) : tx("Olá! 👋");

  if (data === null) {
    return (
      <div className="admin-page">
        <p className="opt-empty">{tx("Sincronizando com o servidor… 🏕️")}</p>
      </div>
    );
  }

  if (data.kids.length === 0) {
    return (
      <div className="admin-page">
        <h1 className="admin-title">{hello}</h1>
        <p className="opt-empty">
          {tx("Ainda não encontramos nenhuma criança ligada a você neste acampamento.")}
          <br />
          {tx("Fale com a organização para ajustar o cadastro.")}
        </p>
      </div>
    );
  }

  const kids: Camper[] = data.kids.map((k) => k.camper);
  const selectedKid = data.kids.find((kid) => kid.camper.id === selectedKidId) ?? data.kids[0];
  const sex = kidIconSex(selectedKid.bedroom?.group, selectedKid.camper.sex);

  return (
    <div className="admin-page">
      <h1 className="admin-title">{hello}</h1>
      <p className="admin-intro">
        {access.open
          ? tx(parentHomeIntroLiteral(data.kids.map((kid) => kidIconSex(kid.bedroom?.group, kid.camper.sex))))
          : access.opensAt && new Date(access.opensAt).getTime() > Date.now()
            ? tx("A equipe do quarto aparece aqui a partir do check-in ({when}).", { when: speakWhen(access.opensAt, { long: true }) })
            : tx("O acampamento terminou. Obrigado por confiar em nós! 💚")}
      </p>

      <CheckinQrDialog kids={kids} active={access.checkin} />

      {/* the people to call — shown the whole time the parent has access, not only during the camp */}
      {contacts.length > 0 && (
        <section className="detail-section">
          <h2 className="detail-h2">📞 {tx("Contatos importantes")}</h2>
          <ul className="parent-contacts">
            {contacts.map((c) => (
              <ImportantContact key={c.id} token={token} personId={c.personId} name={nameOf(c.personId)} title={c.title} />
            ))}
          </ul>
        </section>
      )}

      <ParentKidTabs kids={data.kids} selectedId={selectedKid.camper.id} onSelect={setSelectedKidId} idPrefix="parent-kid-tab" panelId="parent-kid-panel" />

      <div
        id="parent-kid-panel"
        role={data.kids.length > 1 ? "tabpanel" : undefined}
        aria-labelledby={data.kids.length > 1 ? `parent-kid-tab-${selectedKid.camper.id}` : undefined}
        className="parent-kid-panel"
      >
        <KidSection key={selectedKid.camper.id} kid={selectedKid} token={token} showTeam={access.open} />
      </div>

      <PlayScene sex={sex} />
    </div>
  );
}
