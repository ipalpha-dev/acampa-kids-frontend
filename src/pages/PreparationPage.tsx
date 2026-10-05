import { useState, type ReactNode } from "react";
import { speakDay } from "../dates";
import { setMyPrepDone } from "../api/staff";
import RichHtml from "../components/RichHtml";
import SelfCheckinCard from "../components/SelfCheckinCard";
import { useCampTiming } from "../campPhase";
import { useSinkingChecklist } from "../hooks/useSinkingChecklist";
import type { LoggedUser } from "../roles";
import { useCollection, useCollectionOrEmpty } from "../store";
import { useMyPrepRoles } from "../store/derive";
import { ICONS } from "../icons";
import { useI18n } from "../i18n";

interface PreparationPageProps {
  user: LoggedUser;
  token: string;
  /** phones: Preparação and Instruções share one bottom-bar entry — this jumps to the other half */
  pairedWith?: () => void;
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

interface PrepItem {
  key: string;
  emoji: string;
  title: ReactNode;
  html: string;
  role?: boolean;
}

/**
 * Preparação — what the team must know / bring / wear BEFORE the camp:
 *   1. countdown to the first event
 *   2. the preparation of each role the person is scaled in (from the roles)
 *   3. the general sections written by the admin ("O que levar", "Chegada"…)
 * Each card is a checklist item: "Feito ✓" ticks it, it turns grey and sinks
 * to the end of its list. The ticks are saved on the person's staff record
 * (so they follow them to any phone). The admin edits the content in
 * ⚙️ → Preparação and the per-role text in the role itself.
 */
export default function PreparationPage({ user, token, pairedWith }: PreparationPageProps) {
  const { tx, te } = useI18n();
  const sections = useCollection("preparation");
  const myRoles = useMyPrepRoles(user.personId);
  const staff = useCollectionOrEmpty("staff");
  const timing = useCampTiming();
  /** rooms still a draft: this page is the team's home, so the departure-day self check-in lives here */
  const roomsDraft = !!useCollection("settings")?.kidsRoomsDraft;
  const first = user.name.split(" ")[0];
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const me = staff.find((s) => s.id === user.personId);
  const done = new Set(me?.prepDone ?? []);
  const canTick = !!me;

  /** only the roles that actually ask for something — the rest would just be noise here */
  const roleItems: PrepItem[] = (myRoles ?? [])
    .filter((m) => m.role.preparation)
    .map((m) => ({
      key: `role:${m.role.id}`,
      emoji: m.role.emoji,
      title: (
        <>
          {m.role.name}
          {m.details.map((d) => (
            <span key={d} className="staff-tag__n">{d}</span>
          ))}
        </>
      ),
      html: m.role.preparation,
      role: true,
    }));
  const generalItems: PrepItem[] = (sections ?? []).map((s) => ({ key: `section:${s.id}`, emoji: s.emoji, title: s.title, html: s.content }));

  /**
   * ONE list: the person's role items first, then the general ones (each in
   * the admin's order); whatever is ticked sinks to the very end, so when all
   * the role items are done the general ones take the top.
   */
  const all = [...roleItems, ...generalItems];
  /** ticked cards fade in place for a beat, then slide down to the end of the list */
  const { listRef, ordered, settling } = useSinkingChecklist(all, (i) => i.key, (i) => done.has(i.key));

  const total = all.length;
  const doneCount = all.filter((i) => done.has(i.key)).length;
  const allDone = total > 0 && doneCount === total;

  if (sections === null || myRoles === null) {
    return (
      <div className="admin-page">
        <p className="opt-empty">{tx("Sincronizando com o servidor… 🏕️")}</p>
      </div>
    );
  }

  const countdown = countdownLabel(timing.daysToGo, tx);

  async function toggle(item: PrepItem) {
    if (busyKey) return;
    setBusyKey(item.key);
    setError(null);
    try {
      await setMyPrepDone(token, item.key, !done.has(item.key));
    } catch (err) {
      setError(te(err, "Algo deu errado."));
    } finally {
      setBusyKey(null);
    }
  }

  const renderList = () => (
    <div className="prep-sections" ref={listRef}>
      {ordered.map((item) => {
        const isDone = done.has(item.key);
        return (
          <article
            key={item.key}
            data-sink-key={item.key}
            className={`detail-card prep-section ${item.role ? "prep-section--role" : ""} ${isDone ? "prep-section--done" : ""} ${settling.has(item.key) ? "prep-section--settling" : ""}`}
          >
            <header className="prep-section__head">
              <h3 className="prep-section__title">
                <span aria-hidden="true">{item.emoji}</span> {item.title}
                {item.role && <span className="prep-section__tag">{tx("sua função")}</span>}
              </h3>
              {canTick && (
                <button
                  type="button"
                  className={`prep-check ${isDone ? "prep-check--on" : ""}`}
                  aria-pressed={isDone}
                  disabled={busyKey === item.key}
                  title={isDone ? tx("Desmarcar") : tx("Marcar como feito")}
                  aria-label={isDone ? tx("Desmarcar") : tx("Marcar como feito")}
                  onClick={() => toggle(item)}
                >
                  <span className="prep-check__box" aria-hidden="true">{isDone ? "✓" : ""}</span>
                </button>
              )}
            </header>
            {item.html ? <RichHtml html={item.html} /> : <p className="opt-empty">{tx("Em breve.")}</p>}
          </article>
        );
      })}
    </div>
  );

  return (
    <div className="admin-page prep-page">
      <header className="admin-head">
        <h1 className="admin-title"><img className="admin-title__icon" src={ICONS.preparation} alt="" aria-hidden="true" /> {tx("Preparação")}</h1>
        {/* only while the bottom bar merges the pair (phones): the way to the other half */}
        {pairedWith && (
          <button type="button" className="dash-pair-link" onClick={pairedWith} title={tx("Ver as Instruções")}>
            <span aria-hidden="true">📖</span> {tx("Instruções")}
          </button>
        )}
      </header>

      {roomsDraft && <SelfCheckinCard token={token} user={user} />}

      {countdown && (
        <div className="prep-countdown" role="status">
          <span className="prep-countdown__emoji" aria-hidden="true">{countdown.mark}</span>
          <div className="prep-countdown__text">
            <strong>{countdown.text}</strong>
            {timing.firstDate && <span>{timing.daysToGo !== null && timing.daysToGo < 0 ? tx("Começou") : tx("Começa")} {speakDay(timing.firstDate).toLowerCase()}</span>}
          </div>
          {canTick && total > 0 && (
            <div className="prep-progress" aria-label={tx("{n} de {total} itens feitos", { n: doneCount, total })}>
              <strong>{doneCount}/{total}</strong>
              <span>{allDone ? tx("tudo pronto! 🎉") : tx("feitos")}</span>
            </div>
          )}
        </div>
      )}

      <p className="admin-intro">
        {tx("Olá, {name}! Aqui está tudo o que você precisa saber, levar e vestir antes do acampamento.", { name: first })}
        {canTick && total > 0 && tx(" Conforme for resolvendo cada item, marque como feito.")} 😊
      </p>

      {error && <p className="message message--error">{error}</p>}

      {/* ── one checklist: role items (only roles that ask for something) first, then the general ones; done sinks to the end ── */}
      {total > 0 && renderList()}

      {total === 0 && (
        <div className="admin-empty">
          <img className="admin-empty__icon" src={ICONS.preparation} alt="" aria-hidden="true" />
          <p>{tx("Nada para preparar por enquanto. Assim que a organização publicar as orientações, elas aparecem aqui.")}</p>
        </div>
      )}
    </div>
  );
}
