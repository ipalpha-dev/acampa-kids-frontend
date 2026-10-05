import type { ReactNode } from "react";
import { type Bedroom } from "../api/bedrooms";
import { ageOf, type Camper, type HealthInfo } from "../api/campers";
import { useI18n } from "../i18n";
import BedroomTag from "./BedroomTag";
import HealthAlerts from "./HealthAlerts";
import HealthHeart from "./HealthHeart";
import TeamTag from "./TeamTag";
import TransportTag from "./TransportTag";
import styles from "./campers.module.scss";

interface CamperCardProps {
  camper: Camper;
  /** labels the health option ids — only used when `health` is passed */
  labelOf: (id: string | null | undefined) => string | null;
  /** hide the bedroom tag (when already in a room context) */
  hideBedroom?: boolean;
  bedroom?: Pick<Bedroom, "name" | "group"> | null;
  /** click → open the kid's page */
  onOpen?: (camperId: string) => void;
  /** pinned to the top-right corner (e.g. the WhatsApp button to the family) */
  corner?: ReactNode;
  /**
   * Health details, ONLY when the caller read them for a reason (a health-tag
   * filter, a name filter with ≤ 6 kids — decision 31). Otherwise the card
   * shows the neutral ♥ at most.
   */
  health?: HealthInfo | null;
}

/** One kid: name (+ neutral ♥), age when known, bed / team / transport tags. Click navigates to the kid. */
export default function CamperCard({ camper: k, labelOf, hideBedroom, bedroom, onOpen, corner, health }: CamperCardProps) {
  const { tx } = useI18n();
  const age = ageOf(k.birthDate ?? null);
  const showBedroom = !hideBedroom && bedroom;
  const name = k.name || tx("Carregando nome…");

  const body = (
    <div className="kid-card__body">
      <h4 className="kid-card__name">
        <span className={k.name ? undefined : styles.pendingName}>{name}</span>
        <HealthHeart show={k.hasHealth} />
        {age !== null && <span className="kid-card__age">{tx("{age} anos", { age })}</span>}
      </h4>
      {(showBedroom || k.team || k.transportation) && (
        <div className="staff-card__tags">
          {showBedroom && <BedroomTag bedroom={bedroom} />}
          <TeamTag teamId={k.team} />
          <TransportTag transportId={k.transportation} short />
        </div>
      )}
      {health && (
        <div className={styles.healthReveal}>
          <div>
            <HealthAlerts person={health} labelOf={labelOf} />
          </div>
        </div>
      )}
    </div>
  );

  const reviewing = k.aiReviewStatus === "pending" || k.aiReviewStatus === "processing" || k.aiReviewStatus === "structured";

  return (
    <li className={`kid-card ${corner ? "kid-card--with-corner" : ""} ${reviewing ? "camper-ai-review" : ""}`} title={reviewing ? tx("Cadastro em revisão pela IA") : undefined}>
      {corner && <div className="kid-card__corner">{corner}</div>}
      {onOpen ? (
        <button type="button" className="kid-card__main" title={tx("Ver {name}", { name })} onClick={() => onOpen(k.id)}>
          {body}
        </button>
      ) : (
        <div className="kid-card__main kid-card__main--static">{body}</div>
      )}
    </li>
  );
}
