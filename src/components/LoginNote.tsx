import { useEffect, useState } from "react";
import styles from "./LoginNote.module.scss";

/** A gentle, non-error note on the login screen; grows / shrinks smoothly. */
export default function LoginNote({ message }: { message: string | null }) {
  // keep the last text while the note collapses, so it never empties before the animation ends
  const [shown, setShown] = useState(message);
  useEffect(() => {
    if (message) setShown(message);
  }, [message]);
  return (
    <div className={`${styles.wrap} ${message ? styles.open : ""}`} aria-live="polite">
      <div className={styles.inner}>{shown && <p className={styles.note} role="status">{message ?? shown}</p>}</div>
    </div>
  );
}
