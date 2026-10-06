import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../api/client";
import { confirmPendingKinds, fetchPendingKinds, type SharedKind } from "../api/pendingKinds";
import { useI18n } from "../i18n";
import styles from "./PendingKindsCard.module.scss";

interface PendingKindsCardProps {
  /** the family's session (its own responsável role token answers in IPAlpha) */
  token: string;
}

/** friendly words for what is shared about the family member themselves */
const KIND_LABELS: Record<SharedKind, string> = {
  phone: "Seu celular",
  email: "Seu e-mail",
  emergencyContact: "Um contato para emergências",
  address: "Seu endereço",
  document: "Seu documento",
  medical: "Suas informações de saúde",
  school: "Sua escola",
};
const KIND_ORDER = Object.keys(KIND_LABELS) as SharedKind[];

/** "agora não" hides the step for this visit only: memory, never the device; a reload asks again */
let laterFor: string | null = null;

type Note = { kind: "done" | "changed" | "error"; text: string };

/**
 * Decision 87: someone who just became responsável for a kid (an accepted link request) shares nothing about
 * THEMSELVES until they confirm. One gentle step lists it in friendly words; one button confirms exactly what
 * is shown (all-or-nothing). If what is asked changed meanwhile (409), the new list is shown with a note.
 */
export default function PendingKindsCard({ token }: PendingKindsCardProps) {
  const { tx } = useI18n();
  const [kinds, setKinds] = useState<SharedKind[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  const [later, setLater] = useState(laterFor === token);

  const load = useCallback(async () => {
    try {
      const pending = await fetchPendingKinds(token);
      setKinds(pending.items.length > 0 ? pending.kinds : []);
      return pending.items.length > 0 ? pending.kinds : [];
    } catch {
      // nothing to ask right now — the step simply stays away
      return null;
    }
  }, [token]);

  useEffect(() => {
    if (later) return;
    void load();
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load, later]);

  async function confirm() {
    if (busy || kinds.length === 0) return;
    setBusy(true);
    setNote(null);
    try {
      await confirmPendingKinds(token, kinds);
      setNote({ kind: "done", text: tx("Obrigado! Agora a equipe pode cuidar bem da sua criança e falar com você quando precisar.") });
    } catch (err) {
      if (err instanceof ApiError && err.code === "PENDING_CHANGED") {
        const fresh = await load();
        if (fresh && fresh.length > 0) setNote({ kind: "changed", text: tx("O que pedimos mudou um pouquinho. Confira a lista de novo, por favor.") });
      } else {
        setNote({ kind: "error", text: tx("Não foi possível confirmar agora. Tente de novo.") });
      }
    } finally {
      setBusy(false);
    }
  }

  function notNow() {
    laterFor = token;
    setLater(true);
  }

  const done = note?.kind === "done";
  const open = !later && kinds.length > 0;
  const shown = KIND_ORDER.filter((k) => kinds.includes(k));
  return (
    // stays mounted while it shrinks away ("agora não"), inert so nothing hidden can be reached
    <div className={`${styles.reveal} ${open ? styles.revealOpen : ""}`} aria-hidden={open ? undefined : true} inert={!open}>
      <div className={styles.revealInner}>
        {kinds.length > 0 && (
          <section className={`detail-section ${styles.step}`} aria-label={tx("Confirme o que você compartilha com o acampamento")}>
            <h2 className="detail-h2">{tx("Confirme o que você compartilha com o acampamento")}</h2>
            <div className={`detail-card ${styles.card}`}>
              <p className="cat-hint">{tx("Para a equipe cuidar bem da sua criança e conseguir falar com você quando precisar, o acampamento gostaria de ver:")}</p>
              <ul className={`${styles.kinds} ${busy ? styles.kindsBusy : ""}`}>
                {shown.map((k) => (
                  <li key={k} className={styles.kind}>
                    {tx(KIND_LABELS[k])}
                  </li>
                ))}
              </ul>
              <p className={`cat-hint ${styles.calm}`}>{tx("Fica guardado no IPAlpha, com todo o cuidado. Nada é compartilhado antes de você confirmar.")}</p>
              <div className={`${styles.reveal} ${note && note.kind !== "error" ? styles.revealOpen : ""}`} role="status">
                <p className={`message ${styles.note} ${done ? styles.noteDone : ""} ${styles.revealInner}`}>{note && note.kind !== "error" ? note.text : ""}</p>
              </div>
              <div className={`${styles.reveal} ${note?.kind === "error" ? styles.revealOpen : ""}`} role="alert">
                <p className={`message message--error ${styles.revealInner}`}>{note?.kind === "error" ? note.text : ""}</p>
              </div>
              <div className={`${styles.reveal} ${done ? "" : styles.revealOpen}`}>
                <div className={`cat-form__actions ${styles.revealInner}`}>
                  <button type="button" className="button button--secondary" disabled={busy || done} onClick={notNow}>
                    {tx("Agora não")}
                  </button>
                  <button type="button" className="button button--primary" disabled={busy || done} onClick={() => void confirm()}>
                    {busy ? tx("Confirmando…") : tx("Confirmar e compartilhar")}
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
