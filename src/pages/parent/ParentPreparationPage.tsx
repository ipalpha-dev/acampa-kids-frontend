import { useState, type ReactNode } from "react";
import { speakDay } from "../../dates";
import { setMyPrepSectionDone } from "../../api/preparation";
import RichHtml from "../../components/RichHtml";
import { useCampTiming } from "../../campPhase";
import { useSinkingChecklist } from "../../hooks/useSinkingChecklist";
import type { LoggedUser } from "../../roles";
import { useCollection } from "../../store";
import { ICONS } from "../../icons";
import { useI18n } from "../../i18n";

interface ParentPreparationPageProps {
  user: LoggedUser;
  token: string;
}

function countdownLabel(
  daysToGo: number | null,
  tx: (pt: string, vars?: Record<string, string | number>) => string,
): { mark: ReactNode; text: string } | null {
  if (daysToGo === null) return null;
  if (daysToGo > 1) return { mark: "⏳", text: tx("Faltam {n} dias", { n: daysToGo }) };
  if (daysToGo === 1) return { mark: <img className="prep-countdown__icon" src={ICONS.preparation} alt="" />, text: tx("É amanhã!") };
  if (daysToGo === 0) return { mark: "🚌", text: tx("É hoje!") };
  return { mark: "🏕️", text: tx("Acampamento em andamento") };
}

/**
 * "Preparação" for a PARENT: the general sections the admin posted to the
 * parents ("O que levar na mala", "Chegada na igreja"…). The server only sends
 * the sections posted to `parent`, so no filtering here.
 *
 * Each section is a CHECKLIST item, exactly like the team's page: "✓" ticks
 * it, it turns grey and sinks to the end of the list. The ticks are saved on
 * the responsible's own record (so they follow them to any phone).
 */
export default function ParentPreparationPage({ user, token }: ParentPreparationPageProps) {
  const { tx, te } = useI18n();
  const sections = useCollection("preparation");
  const timing = useCampTiming();
  const first = user.name.split(" ")[0];
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** ticked cards fade in place for a beat, then slide down to the end of the list */
  const { listRef, ordered, settling } = useSinkingChecklist(
    sections ?? [],
    (s) => s.id,
    (s) => !!s.done,
  );

  if (sections === null) {
    return (
      <div className="admin-page">
        <p className="opt-empty">{tx("Sincronizando com o servidor… 🏕️")}</p>
      </div>
    );
  }

  const countdown = countdownLabel(timing.daysToGo, tx);

  const total = sections.length;
  const doneCount = sections.filter((s) => s.done).length;
  const allDone = total > 0 && doneCount === total;

  async function toggle(id: string, done: boolean) {
    if (busyId) return;
    setBusyId(id);
    setError(null);
    try {
      await setMyPrepSectionDone(token, id, !done);
    } catch (err) {
      setError(te(err, "Algo deu errado."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="admin-page prep-page">
      <header className="admin-head">
        <h1 className="admin-title"><img className="admin-title__icon" src={ICONS.preparation} alt="" aria-hidden="true" /> {tx("Preparação")}</h1>
      </header>

      {countdown && (
        <div className="prep-countdown" role="status">
          <span className="prep-countdown__emoji" aria-hidden="true">{countdown.mark}</span>
          <div className="prep-countdown__text">
            <strong>{countdown.text}</strong>
            {timing.firstDate && <span>{timing.daysToGo !== null && timing.daysToGo < 0 ? tx("Começou") : tx("Começa")} {speakDay(timing.firstDate).toLowerCase()}</span>}
          </div>
          {total > 0 && (
            <div className="prep-progress" aria-label={tx("{n} de {total} itens feitos", { n: doneCount, total })}>
              <strong>{doneCount}/{total}</strong>
              <span>{allDone ? tx("tudo pronto! 🎉") : tx("feitos")}</span>
            </div>
          )}
        </div>
      )}

      <p className="admin-intro">
        {tx("Olá, {name}! Aqui está tudo o que sua família precisa saber e preparar antes do acampamento.", { name: first })}
        {total > 0 && tx(" Conforme for resolvendo cada item, marque como feito.")} 😊
      </p>

      {error && <p className="message message--error">{error}</p>}

      {total > 0 && (
        <div className="prep-sections" ref={listRef}>
          {ordered.map((s) => {
            const isDone = !!s.done;
            return (
              <article
                key={s.id}
                data-sink-key={s.id}
                className={`detail-card prep-section ${isDone ? "prep-section--done" : ""} ${settling.has(s.id) ? "prep-section--settling" : ""}`}
              >
                <header className="prep-section__head">
                  <h3 className="prep-section__title">
                    <span aria-hidden="true">{s.emoji}</span> {s.title}
                  </h3>
                  <button
                    type="button"
                    className={`prep-check ${isDone ? "prep-check--on" : ""}`}
                    aria-pressed={isDone}
                    disabled={busyId === s.id}
                    title={isDone ? tx("Desmarcar") : tx("Marcar como feito")}
                    aria-label={isDone ? tx("Desmarcar") : tx("Marcar como feito")}
                    onClick={() => toggle(s.id, isDone)}
                  >
                    <span className="prep-check__box" aria-hidden="true">{isDone ? "✓" : ""}</span>
                  </button>
                </header>
                {s.content ? <RichHtml html={s.content} /> : <p className="opt-empty">{tx("Em breve.")}</p>}
              </article>
            );
          })}
        </div>
      )}

      {total === 0 && (
        <div className="admin-empty">
          <img className="admin-empty__icon" src={ICONS.preparation} alt="" aria-hidden="true" />
          <p>{tx("Nada para preparar por enquanto. Assim que a organização publicar as orientações, elas aparecem aqui.")}</p>
        </div>
      )}
    </div>
  );
}
