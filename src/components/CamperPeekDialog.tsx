import Dialog from "./Dialog";
import BedroomTag from "./BedroomTag";
import GuardianWhatsApp from "./GuardianWhatsApp";
import HealthAlerts, { useHealthLabelOf } from "./HealthAlerts";
import HealthHeart from "./HealthHeart";
import KidIcon from "./KidIcon";
import TeamTag from "./TeamTag";
import { kidIconSex } from "../icons";
import { ageOf, type HealthInfo } from "../api/campers";
import { loadAuth } from "../auth/store";
import { navigate } from "../router";
import { useI18n } from "../i18n";
import { useCamperDetail, useLabelOf } from "../store/derive";
import styles from "./campers.module.scss";
import { nameSettled, unnamedText } from "../store/people";

interface CamperPeekDialogProps {
  /** null = closed */
  camperId: string | null;
  /** shown while the record is still syncing */
  name?: string;
  /**
   * The kid's health, ONLY when the caller already read it for this moment
   * (e.g. the care team's medication checklist). Without it the card shows
   * the neutral ♥ at most — details live on the kid's page.
   */
  health?: HealthInfo | null;
  onClose: () => void;
}

/**
 * A quick look at a kid in a popup (name, room, team) with a tap-to-read way
 * to reach the family. "Ver ficha completa" opens the kid's page, where the
 * health is read live.
 */
export default function CamperPeekDialog({ camperId, name, health, onClose }: CamperPeekDialogProps) {
  const { tx } = useI18n();
  const data = useCamperDetail(camperId ?? "");
  const labelOf = useLabelOf();
  const healthLabelOf = useHealthLabelOf(loadAuth()?.token ?? "");
  const k = data?.camper;
  const age = k ? ageOf(k.birthDate ?? null) : null;
  const sex = k ? (kidIconSex(data?.bedroom?.group, k.sex) ?? "girl") : "girl";
  const shownName = k?.name || name || "";

  return (
    <Dialog open={!!camperId} onClose={onClose} title={shownName || tx("Criança")} width={520}>
      <div className="cat-form cat-form--plain">
        <header className="kid-peek__head">
          <KidIcon sex={sex} size={40} />
          <h2 className="cat-form__title kid-peek__name">
            {shownName || <span className={nameSettled(camperId) ? undefined : styles.pendingName}>{tx(unnamedText(camperId))}</span>}
            <HealthHeart show={k?.hasHealth} />
            {age !== null && <span className="kid-card__age">{tx("{age} anos", { age })}</span>}
          </h2>
          {k && <GuardianWhatsApp camper={k} className="" />}
        </header>

        {!k ? (
          <p className="opt-empty">{tx("Sincronizando… 🏕️")}</p>
        ) : (
          <>
            <div className="staff-card__tags">
              {data?.bedroom && <BedroomTag bedroom={data.bedroom} />}
              {labelOf(k.bed) && <span className="staff-tag">{tx("Cama {bed}", { bed: labelOf(k.bed)!.toLowerCase() })}</span>}
              <TeamTag teamId={k.team} />
              {health?.weightKg != null && <span className="staff-tag">{tx("{weight} kg", { weight: String(health.weightKg).replace(".", ",") })}</span>}
            </div>

            {health && (
              <div className={styles.healthReveal}>
                <div>
                  <HealthAlerts person={health} labelOf={healthLabelOf} boxed />
                  {(health.insurance || health.insuranceCard) && (
                    <dl className="detail-grid kid-peek__contacts">
                      <dt>{tx("Convênio")}</dt>
                      <dd>
                        {health.insurance || "—"}
                        {health.insuranceCard && <span className="cat-hint">· {health.insuranceCard}</span>}
                      </dd>
                    </dl>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        <div className="cat-form__actions">
          <button type="button" className="button button--secondary" onClick={onClose}>
            {tx("Fechar")}
          </button>
          <button
            type="button"
            className="button button--primary"
            title={tx("Abrir a página da criança")}
            onClick={() => {
              navigate(`/campers/${camperId}`);
              onClose();
            }}
          >
            <span className="ficha-btn__full">{tx("Ver ficha completa")}</span>
            <span className="ficha-btn__short">{tx("Ver ficha")}</span>
          </button>
        </div>
      </div>
    </Dialog>
  );
}
