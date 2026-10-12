import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../api/client";
import { acceptCampConsent, fetchCampConsents, type CampConsents, type ConsentDocument } from "../api/consents";
import { useI18n, type Locale } from "../i18n";
import SafeMarkdown from "./SafeMarkdown";
import styles from "./CampAuthorizationCard.module.scss";

interface CampAuthorizationCardProps {
  /** the family's session (their own responsável tokens answer in IPAlpha) */
  token: string;
  /** the family's kids at this camp (ids + names they already see on the home screen) */
  kids: { id: string; name: string }[];
}

/** documents-api title keys per app locale */
const TITLE_KEY: Record<Locale, string> = { pt: "pt-BR", en: "en-US", es: "es", fr: "fr", de: "de" };

/** "agora não" hides the step for this visit only: memory, never the device; a reload asks again */
let laterFor: string | null = null;

type Note = { kind: "done" | "changed" | "error"; text: string };

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";

/**
 * Decision 13: the camp authorization, on the family's screen. For each document the edition still asks of a child, the
 * EXACT current text is shown and the responsável authorizes on the child's behalf — one button per child, recording the
 * version they read. Accepting is framed as caring for the child; not accepting is never a failure (there is no "decline",
 * only "agora não" and the coordenação to talk to). Acampa never offers a withdrawal (Q3).
 */
export default function CampAuthorizationCard({ token, kids }: CampAuthorizationCardProps) {
  const { tx, te, locale } = useI18n();
  const [state, setState] = useState<CampConsents | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [accepted, setAccepted] = useState<string[]>([]);
  const [later, setLater] = useState(laterFor === token);

  const load = useCallback(async () => {
    try {
      const next = await fetchCampConsents(token);
      setState(next);
      return next;
    } catch {
      // nothing to show right now — the step simply stays away
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

  const nameOf = (id: string) => firstName(kids.find((k) => k.id === id)?.name ?? "") || tx("sua criança");
  const titleOf = (d: ConsentDocument) => d.title[TITLE_KEY[locale]] ?? d.title["pt-BR"] ?? tx("Autorização do acampamento");

  async function accept(personId: string, doc: ConsentDocument) {
    const key = `${personId}|${doc.document}`;
    if (busy) return;
    setBusy(key);
    setNote(null);
    try {
      await acceptCampConsent(token, { personId, document: doc.document, version: doc.version });
      setAccepted((list) => [...list, personId]);
      setNote({ kind: "done", text: tx("Obrigado! A autorização de {name} está registrada. Vamos cuidar com todo o carinho.", { name: nameOf(personId) }) });
      await load();
    } catch (err) {
      if (err instanceof ApiError && (err.code === "CONSENT_VERSION_CHANGED" || err.code === "CONSENT_NOT_REQUIRED")) {
        await load();
        setNote({ kind: "changed", text: err.code === "CONSENT_VERSION_CHANGED" ? tx("O texto da autorização foi atualizado. Leia a nova versão, por favor.") : tx("Esta autorização não é mais pedida neste acampamento.") });
      } else {
        setNote({ kind: "error", text: te(err, "Não foi possível registrar agora. Tente de novo daqui a pouco.") });
      }
    } finally {
      setBusy(null);
    }
  }

  function notNow() {
    laterFor = token;
    setLater(true);
  }

  const children = state?.children ?? [];
  const docs = (state?.documents ?? []).map((d) => ({ doc: d, waiting: children.filter((k) => k.pending.some((p) => p.document === d.document && p.version === d.version)).map((k) => k.personId) })).filter((x) => x.waiting.length > 0);
  const done = children.filter((k) => k.pending.length === 0 && accepted.includes(k.personId)).map((k) => k.personId);
  const open = !later && (docs.length > 0 || done.length > 0);

  return (
    // stays mounted while it grows / shrinks, inert when closed so nothing hidden can be reached
    <div className={`${styles.reveal} ${open ? styles.revealOpen : ""}`} aria-hidden={open ? undefined : true} inert={!open}>
      <div className={styles.revealInner}>
        {(docs.length > 0 || done.length > 0) && (
          <section className={`detail-section ${styles.step}`} aria-label={tx("Autorização do acampamento")}>
            <h2 className="detail-h2">{tx("Autorização do acampamento")}</h2>
            <div className={`detail-card ${styles.card}`}>
              {docs.length > 0 && <p className="cat-hint">{tx("Para cuidarmos bem da sua criança no acampamento, leia com calma e autorize a participação.")}</p>}

              {docs.map(({ doc, waiting }) => (
                <article key={`${doc.document}@${doc.version}`} className={styles.doc} aria-label={titleOf(doc)}>
                  <h3 className={styles.docTitle}>{titleOf(doc)}</h3>
                  <div className={styles.docText} tabIndex={0} role="document" aria-label={tx("Texto da autorização")}>
                    <SafeMarkdown markdown={doc.markdown} />
                  </div>
                  {locale !== "pt" && <p className={`cat-hint ${styles.calm}`}>{tx("O texto da autorização está em português, como foi publicado pela igreja.")}</p>}
                  <ul className={styles.kids}>
                    {waiting.map((personId) => {
                      const key = `${personId}|${doc.document}`;
                      return (
                        <li key={personId} className={styles.kid}>
                          <span className={`${styles.badge} ${styles.badgeWaiting}`}>{tx("Aguardando sua autorização")}</span>
                          <button type="button" className="button button--primary" disabled={!!busy} aria-busy={busy === key} onClick={() => void accept(personId, doc)}>
                            {busy === key ? tx("Registrando…") : tx("Li e autorizo a participação de {name}", { name: nameOf(personId) })}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </article>
              ))}

              {done.length > 0 && (
                <ul className={styles.kids}>
                  {done.map((personId) => (
                    <li key={personId} className={`${styles.kid} ${styles.kidDone}`}>
                      <span className={`${styles.badge} ${styles.badgeDone}`}>{tx("Autorização aceita")}</span>
                      <span>{nameOf(personId)}</span>
                    </li>
                  ))}
                </ul>
              )}

              <div className={`${styles.reveal} ${note && note.kind !== "error" ? styles.revealOpen : ""}`} role="status">
                <p className={`message ${styles.note} ${note?.kind === "done" ? styles.noteDone : ""} ${styles.revealInner}`}>{note && note.kind !== "error" ? note.text : ""}</p>
              </div>
              <div className={`${styles.reveal} ${note?.kind === "error" ? styles.revealOpen : ""}`} role="alert">
                <p className={`message message--error ${styles.revealInner}`}>{note?.kind === "error" ? note.text : ""}</p>
              </div>

              <p className={`cat-hint ${styles.calm}`}>{tx("Você pode conversar com a coordenação se tiver dúvidas.")}</p>
              {docs.length > 0 && (
                <div className="cat-form__actions">
                  <button type="button" className="button button--secondary" disabled={!!busy} onClick={notNow}>
                    {tx("Agora não")}
                  </button>
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
