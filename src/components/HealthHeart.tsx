import { useI18n } from "../i18n";

/**
 * The neutral ♥ of the people lists (decision 31): this person has health
 * information — never what it is. Only roles allowed health receive
 * `hasHealth`; details live on the person page.
 */
export default function HealthHeart({ show }: { show: boolean | undefined }) {
  const { tx } = useI18n();
  if (!show) return null;
  return (
    <span className="health-heart" role="img" aria-label={tx("Tem informações de saúde")} title={tx("Tem informações de saúde — veja na página da pessoa")}>
      ♥
    </span>
  );
}
