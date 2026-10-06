import { useEffect, useState } from "react";
import { listCamperChanges, PARENT_FIELD_LABEL, type CamperChange } from "../../api/campers";
import Dialog from "../../components/Dialog";
import { speakDateTime } from "../../dates";
import { useI18n } from "../../i18n";
import { roleMeta } from "../../roles";
import { useNames } from "../../store/people";
import styles from "../../components/campers.module.scss";

interface CamperHistoryDialogProps {
  token: string;
  open: boolean;
  camperId: string;
  camperName: string;
  onClose: () => void;
}

/**
 * Which fields of the kid's health / notes were changed, by whom and when,
 * newest first. The values themselves live in IPAlpha and are not repeated
 * here; names are read live.
 */
export default function CamperHistoryDialog({ token, open, camperId, camperName, onClose }: CamperHistoryDialogProps) {
  const { tx, te } = useI18n();
  const [changes, setChanges] = useState<CamperChange[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nameOf = useNames(changes?.map((c) => c.byPersonId) ?? []);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setChanges(null);
    setError(null);
    listCamperChanges(token, camperId)
      .then((c) => alive && setChanges(c))
      .catch((e) => alive && setError(te(e, "Algo deu errado.")));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, token, camperId]);

  const first = camperName.split(" ")[0] || tx("a criança");

  return (
    <Dialog open={open} onClose={onClose} title={tx("Histórico de alterações")} width={640}>
      <div className="cat-form">
        <h2 className="cat-form__title">{tx("🕓 Alterações · {name}", { name: first })}</h2>
        <p className="cat-hint">{tx("Mostra quais campos mudaram, quem mudou e quando. Os dados ficam guardados no IPAlpha.")}</p>
        {error && <p className="message message--error">{error}</p>}
        {!error && changes === null && <p className="opt-empty">{tx("Carregando…")}</p>}
        {changes && changes.length === 0 && <p className="opt-empty">{tx("Nada foi alterado ainda.")}</p>}
        {changes && changes.length > 0 && (
          <ol className="history-list">
            {changes.map((c) => {
              const who = nameOf(c.byPersonId);
              return (
                <li key={c.id} className={`history-item ${styles.historyItem} ${c.medical ? "history-item--medical" : ""}`}>
                  <p className="history-item__head">
                    <strong className={who ? undefined : styles.pendingName}>{who || tx("Carregando nome…")}</strong>
                    {" · "}
                    {tx(roleMeta(c.byRole).label)} · {speakDateTime(c.at)}
                    <span className={`staff-tag ${c.medical ? "staff-tag--late" : "staff-tag--soft"}`}>{c.medical ? tx("🩺 saúde") : tx("📝 observações")}</span>
                  </p>
                  <ul className={styles.historyFields} aria-label={tx("Campos alterados")}>
                    {c.fields.map((f) => (
                      <li key={f} className="staff-tag">
                        {tx(PARENT_FIELD_LABEL[f] ?? f)}
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ol>
        )}
        <div className="cat-form__actions">
          <button type="button" className="button button--secondary" onClick={onClose}>
            {tx("Fechar")}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
