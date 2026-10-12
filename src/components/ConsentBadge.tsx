import { useConsentStatus } from "../hooks/useConsentStatus";
import { useI18n } from "../i18n";
import styles from "./ConsentBadge.module.scss";

/**
 * The team's small "Autorização aceita / pendente" pill for one child (decision 13). Nothing at all when the role may
 * not see it, when the edition asks no document, or while it loads. Gentle: pending is a fact, never a fault.
 */
export default function ConsentBadge({ personId }: { personId: string }) {
  const { tx } = useI18n();
  const accepted = useConsentStatus(personId);
  if (accepted === null) return null;
  return accepted ? (
    <span className={`${styles.badge} ${styles.done}`} title={tx("A família já autorizou a participação no acampamento.")}>
      {tx("Autorização aceita")}
    </span>
  ) : (
    <span className={`${styles.badge} ${styles.waiting}`} title={tx("A família ainda não autorizou pelo app. Se precisar, converse com ela com carinho.")}>
      {tx("Autorização pendente")}
    </span>
  );
}
