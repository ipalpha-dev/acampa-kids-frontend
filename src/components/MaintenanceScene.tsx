import maintenanceArt from "../assets/maintenance-camp.svg";
import { useT } from "../i18n";
import styles from "./MaintenanceScene.module.scss";

interface MaintenanceSceneProps {
  onRetry: () => void;
}

/**
 * IPAlpha (core) is unreachable — IPALPHA_UNAVAILABLE from either login path. A cheerful
 * "we're tidying up the camp" scene instead of an error; rendered inside the green panel.
 */
export default function MaintenanceScene({ onRetry }: MaintenanceSceneProps) {
  const t = useT();
  return (
    <section className={styles.scene} aria-labelledby="maintenance-title">
      <img className={styles.art} src={maintenanceArt} alt={t("maintenance.imageAlt")} width={480} height={360} />
      <h1 id="maintenance-title" className={`camping-panel__title ${styles.title}`}>
        {t("maintenance.title")}
      </h1>
      <p className={`panel-text ${styles.text}`}>{t("maintenance.text")}</p>
      <button type="button" className={`button button--primary ${styles.retry}`} onClick={onRetry}>
        {t("maintenance.retry")}
      </button>
    </section>
  );
}
