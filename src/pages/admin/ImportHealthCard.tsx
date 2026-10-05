import { useCallback, useEffect, useState } from "react";
import { importErrorMessage, listPausedCamperImports, resumeCamperImport, type PausedImport } from "../../api/camperImports";
import { listPausedStaffImports, resumeStaffImport } from "../../api/staffImports";
import { speakStamp } from "../../dates";
import { useI18n } from "../../i18n";
import { IMPORT_NEEDS_SIGN_IN_EVENT } from "../../store/realtime";
import styles from "./data.module.scss";

interface ImportHealthCardProps {
  token: string;
}

type Paused = PausedImport & { subject: "camper" | "staff" };

/**
 * Settings → Geral (coordenação): "Informações de saúde da importação".
 *
 * Decision 50: after Apply, the import worker writes the AI-organized health
 * straight to IPAlpha with the importer's own sign-in (sealed on the job,
 * deleted when it ends) — nothing about health waits in Acampa. When that
 * sign-in ends mid-way, the job pauses; this card lists the paused imports I
 * started and resumes them with my current (fresh) sign-in.
 */
export default function ImportHealthCard({ token }: ImportHealthCardProps) {
  const { tx } = useI18n();
  const [items, setItems] = useState<Paused[] | null>(null);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [campers, staff] = await Promise.all([listPausedCamperImports(token), listPausedStaffImports(token)]);
      setItems([...campers.map((i) => ({ ...i, subject: "camper" as const })), ...staff.map((i) => ({ ...i, subject: "staff" as const }))]);
    } catch {
      // not coordenação / offline: the card simply stays out of the way
      setHidden(true);
    }
  }, [token]);

  useEffect(() => {
    void load();
    // the worker paused one of my imports while this screen is open: show it right away
    const onPaused = () => void load();
    window.addEventListener(IMPORT_NEEDS_SIGN_IN_EVENT, onPaused);
    return () => window.removeEventListener(IMPORT_NEEDS_SIGN_IN_EVENT, onPaused);
  }, [load]);

  async function resume(item: Paused) {
    if (busy) return;
    setBusy(item.id);
    setError(null);
    setDone(null);
    try {
      if (item.subject === "camper") await resumeCamperImport(token, item.id);
      else await resumeStaffImport(token, item.id);
      setDone(tx("Pronto! A IA continua gravando as informações de saúde de {file} no IPAlpha.", { file: item.fileName }));
      setItems((list) => (list ?? []).filter((i) => i.id !== item.id));
    } catch (e) {
      setError(importErrorMessage(e, tx("Não foi possível continuar agora. Tente de novo em instantes."), tx));
    } finally {
      setBusy(null);
    }
  }

  if (hidden) return null;
  const pending = items?.length ?? 0;

  return (
    <section className="cat-form">
      <h2 className="cat-form__title">🩺 {tx("Informações de saúde da importação")}</h2>
      <p className="cat-hint">
        {tx("Depois de aplicar uma planilha, a IA organiza as informações de saúde e grava direto no IPAlpha com o seu acesso — nada fica guardado no acampamento.")}
      </p>
      <div className={`${styles.reveal} ${items ? styles.revealOpen : ""}`}>
        <div className={styles.revealInner}>
          {items && pending === 0 && <p className="opt-empty">{tx("Nenhuma importação esperando por você. 💚")}</p>}
          {pending > 0 && (
            <>
              <p className="message message--warn">
                {pending === 1
                  ? tx("1 importação está esperando você. O seu acesso ao IPAlpha terminou enquanto a IA trabalhava — nada se perdeu.")
                  : tx("{n} importações estão esperando você. O seu acesso ao IPAlpha terminou enquanto a IA trabalhava — nada se perdeu.", { n: pending })}
              </p>
              <ul className={styles.pausedList}>
                {items!.map((item) => (
                  <li key={item.id} className={styles.pausedItem}>
                    <div>
                      <strong>{item.fileName}</strong>
                      <span className="cat-hint">
                        {" · "}
                        {item.subject === "camper" ? tx("Acampantes") : tx("Equipe")}
                        {item.pausedAt ? ` · ${tx("pausada {when}", { when: speakStamp(item.pausedAt) })}` : ""}
                      </span>
                    </div>
                    <button type="button" className="button button--primary" disabled={!!busy} onClick={() => void resume(item)}>
                      {busy === item.id ? tx("Gravando…") : tx("Gravar no IPAlpha")}
                    </button>
                  </li>
                ))}
              </ul>
              <p className="cat-hint">{tx("Se você acabou de entrar de novo, é só tocar em Gravar no IPAlpha. Só quem começou a importação pode continuar.")}</p>
            </>
          )}
        </div>
      </div>
      {error && <p className="message message--error">{error}</p>}
      {done && <p className="message message--ok">✅ {done}</p>}
    </section>
  );
}
