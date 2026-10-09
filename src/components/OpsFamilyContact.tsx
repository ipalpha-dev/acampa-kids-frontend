import { useState } from "react";
import { loadAuth } from "../auth/store";
import { useCamperLive } from "../hooks/usePersonData";
import { useI18n } from "../i18n";
import styles from "../styles/ops.module.scss";
import PersonContact from "./PersonContact";

interface OpsFamilyContactProps {
  /** the kid (person id) */
  camperId: string;
  /** the kid's live name — the WhatsApp greeting says who the conversation is about */
  kidName: string;
  /** session token (defaults to the stored session) */
  token?: string;
  className?: string;
}

/**
 * The kid's responsáveis, read from IPAlpha ONLY when someone taps "Família"
 * (GET /api/campers/:id — core's role rules decide; logged for the family).
 * Each responsável's phone is a second tap (PersonContact). Nothing is kept.
 */
export default function OpsFamilyContact({ camperId, kidName, token: tokenProp, className = "" }: OpsFamilyContactProps) {
  const { tx } = useI18n();
  const token = tokenProp ?? loadAuth()?.token ?? "";
  const [asked, setAsked] = useState(false);
  const live = useCamperLive(token, asked ? camperId : null);

  if (!asked) {
    return (
      <button type="button" className={`button button--secondary button--small ${className}`} title={tx("Ver os responsáveis de {name}", { name: kidName.split(" ")[0] || "…" })} onClick={() => setAsked(true)}>
        👪 {tx("Família")}
      </button>
    );
  }
  if (!live.data) {
    return live.error ? (
      <span className="cat-hint">{tx("Não foi possível ver a família agora.")}</span>
    ) : (
      <span className={`cat-hint ${styles.loading}`}>{tx("Carregando…")}</span>
    );
  }
  if (live.data.responsibles.length === 0) return <span className="cat-hint">{live.data.responsiblesHidden ? tx("Os responsáveis desta criança não aparecem para o seu perfil. A coordenação pode ajudar.") : tx("Nenhum responsável ligado a esta criança.")}</span>;
  return (
    <ul className={`${styles.family} ${className}`}>
      {live.data.responsibles.map((r) => (
        <li key={r.personId} className={styles.familyRow}>
          <span className={styles.familyName}>{r.name || "…"}</span>
          <PersonContact token={token} personId={r.personId} name={r.name} about={kidName} compact />
        </li>
      ))}
    </ul>
  );
}
