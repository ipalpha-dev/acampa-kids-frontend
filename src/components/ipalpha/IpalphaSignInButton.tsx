import { useEffect, useState } from "react";
import churchLogo from "../../assets/church-logo.png";
import { useT } from "../../i18n";
import styles from "./IpalphaSignInButton.module.scss";

interface IpalphaSignInButtonProps {
  busy: boolean;
  /** Disabled while the phone form is sending. */
  disabled?: boolean;
  error: string | null;
  notice: string | null;
  onStart: () => void;
}

/** "ou · Entrar com IPAlpha" under the phone form, with its own feedback line (grows/shrinks smoothly). */
export default function IpalphaSignInButton({ busy, disabled, error, notice, onStart }: IpalphaSignInButtonProps) {
  const t = useT();
  const message = error ?? notice;
  // keep the last text while the line collapses, so it never empties before the animation ends
  const [shown, setShown] = useState(message);
  useEffect(() => {
    if (message) setShown(message);
  }, [message]);

  return (
    <div className={styles.root}>
      <div className={styles.divider} aria-hidden="true">
        <span>{t("login.or")}</span>
      </div>

      <button type="button" className={styles.button} onClick={onStart} disabled={disabled || busy} aria-busy={busy || undefined}>
        <img className={styles.mark} src={churchLogo} alt="" aria-hidden="true" width={28} height={28} />
        <span>{busy ? t("login.ipalphaOpening") : t("login.ipalpha")}</span>
      </button>

      <div className={`${styles.feedback} ${message ? styles.feedbackOpen : ""}`} aria-live="polite">
        <div className={styles.feedbackInner}>
          {shown && <p className={`${styles.note} ${error ? styles.noteError : ""}`}>{message ?? shown}</p>}
        </div>
      </div>
    </div>
  );
}
