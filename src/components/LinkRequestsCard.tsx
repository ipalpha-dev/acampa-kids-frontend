import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../api/client";
import { decideLinkRequest, fetchMyLinkRequests, type LinkRequest } from "../api/linkRequests";
import ParentIcon from "./ParentIcon";
import { useI18n } from "../i18n";
import styles from "./LinkRequestsCard.module.scss";

interface LinkRequestsCardProps {
  /** the family's session (its responsável role token answers in IPAlpha) */
  token: string;
}

type Outcome = { kind: "accepted" | "declined" | "gone"; text: string };

const firstName = (p: LinkRequest["proposedResponsible"]) => (p ? (p.nickname || p.name).split(" ")[0] : "");

/**
 * Pending "another responsável" requests for the family's kids (decision 80, §25):
 * any ONE current responsável accepts or declines (decision 83). Names come from
 * IPAlpha for this screen only — kept in memory, never on the device. Copy speaks
 * of care ("também cuida de"), never of family shape.
 */
export default function LinkRequestsCard({ token }: LinkRequestsCardProps) {
  const { tx } = useI18n();
  const [items, setItems] = useState<LinkRequest[]>([]);
  const [busy, setBusy] = useState<{
    id: string;
    decision: "accept" | "decline";
  } | null>(null);
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const [error, setError] = useState<{ id: string; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const mine = await fetchMyLinkRequests(token);
      // answered ones stay on screen with their confirmation until the page is left
      setItems((prev) => [...mine, ...prev.filter((p) => !mine.some((m) => m.id === p.id) && p.status !== "pending")]);
    } catch {
      // nothing to ask right now — the card simply stays away
    }
  }, [token]);

  useEffect(() => {
    void load();
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  async function decide(r: LinkRequest, decision: "accept" | "decline") {
    if (busy) return;
    setBusy({ id: r.id, decision });
    setError(null);
    const person = firstName(r.proposedResponsible) || tx("outra pessoa");
    const name = firstName(r.child) || tx("a criança");
    try {
      await decideLinkRequest(token, r.id, decision);
      setItems((prev) => prev.map((x) => (x.id === r.id ? { ...x, status: decision === "accept" ? "accepted" : "declined" } : x)));
      setOutcomes((prev) => ({
        ...prev,
        [r.id]:
          decision === "accept"
            ? {
                kind: "accepted",
                text: tx("Pronto! {person} agora também cuida de {name}.", {
                  person,
                  name,
                }),
              }
            : {
                kind: "declined",
                text: tx("Tudo bem, o pedido foi recusado. Nada foi compartilhado."),
              },
      }));
    } catch (err) {
      if (err instanceof ApiError && (err.reason === "requestNotPending" || err.reason === "requestExpired" || err.reason === "linkRequestNotFound")) {
        setItems((prev) => prev.map((x) => (x.id === r.id ? { ...x, status: "expired" } : x)));
        setOutcomes((prev) => ({
          ...prev,
          [r.id]: {
            kind: "gone",
            text: tx("Este pedido já foi respondido ou não vale mais."),
          },
        }));
      } else {
        setError({
          id: r.id,
          text: tx("Não foi possível responder agora. Tente de novo."),
        });
      }
    } finally {
      setBusy(null);
    }
  }

  const open = items.length > 0;
  return (
    <div className={`${styles.reveal} ${open ? styles.revealOpen : ""}`} aria-hidden={open ? undefined : true}>
      <div className={styles.revealInner}>
        {open && (
          <section className="detail-section" aria-label={tx("Pedido para a família")}>
            <h2 className="detail-h2">
              <ParentIcon size={24} /> {tx("Pedido para a família")}
            </h2>
            <ul className={styles.list}>
              {items.map((r) => {
                const person = firstName(r.proposedResponsible) || tx("outra pessoa");
                const name = firstName(r.child) || tx("a criança");
                const outcome = outcomes[r.id];
                const mine = busy?.id === r.id;
                return (
                  <li key={r.id} className={`detail-card ${styles.item}`}>
                    <h3 className={styles.title}>{tx("{person} também cuida de {name}?", { person, name })}</h3>
                    <p className="cat-hint">
                      {tx(
                        "A coordenação de {project} pediu para incluir {person} como outro responsável por {name}. Se você aceitar, {person} poderá acompanhar {name} no Acampa Kids e no IPAlpha, como você.",
                        {
                          project: r.projectName || "Acampa Kids",
                          person,
                          name,
                        },
                      )}
                    </p>
                    <div className={`${styles.reveal} ${outcome ? "" : styles.revealOpen}`}>
                      <div className={`cat-form__actions ${styles.revealInner}`}>
                        <button type="button" className="button button--secondary" disabled={!!busy || !!outcome} onClick={() => void decide(r, "decline")}>
                          {mine && busy?.decision === "decline" ? tx("Recusando…") : tx("Recusar")}
                        </button>
                        <button type="button" className="button button--primary" disabled={!!busy || !!outcome} onClick={() => void decide(r, "accept")}>
                          {mine && busy?.decision === "accept" ? tx("Aceitando…") : tx("Aceitar")}
                        </button>
                      </div>
                    </div>
                    <div className={`${styles.reveal} ${outcome ? styles.revealOpen : ""}`} role="status">
                      <p className={`message ${styles.answer} ${outcome?.kind === "accepted" ? styles.answerAccepted : ""} ${styles.revealInner}`}>{outcome?.text}</p>
                    </div>
                    <div className={`${styles.reveal} ${error?.id === r.id ? styles.revealOpen : ""}`} role="alert">
                      <p className={`message message--error ${styles.revealInner}`}>{error?.id === r.id ? error.text : ""}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
