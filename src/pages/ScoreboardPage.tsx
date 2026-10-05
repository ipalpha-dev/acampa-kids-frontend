import { useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { addScore } from "../api/scores";
import { contrastText, type Team } from "../api/teams";
import Dialog from "../components/Dialog";
import BulkPointsPage from "./BulkPointsPage";
import ScoreHistoryPage from "./score/ScoreHistoryPage";
import TeamScorePage from "./score/TeamScorePage";
import EventScorePage from "./score/EventScorePage";
import ScoreSuspenseDialog from "./score/ScoreSuspenseDialog";
import { fmtPoints, fmtShort, KIND_META, lineKind, useEventMap, useTeamMap } from "./score/scoreLog";
import { useRoute } from "../router";
import { useCollection, useCollectionOrEmpty } from "../store";
import Breadcrumbs from "../components/Breadcrumbs";
import { ICONS } from "../icons";
import { useI18n } from "../i18n";
import { speakWhen } from "../dates";
import { useScoreSuspense } from "../scoreSuspense";
import { usePersonName } from "../store/people";
import styles from "../styles/ops.module.scss";

/** A person's name read live from IPAlpha (score lines carry ids only); "…" until it arrives. */
function LiveName({ id, first = false }: { id: string | null | undefined; first?: boolean }) {
  const name = usePersonName(id);
  return <>{(first ? name.split(" ")[0] : name) || "…"}</>;
}

interface ScoreboardPageProps {
  token: string;
  /** the logged-in user's id — a score helper may delete only their own lines */
  userId: string;
  /** admin / game organizer: may give, take and delete any line */
  canEdit: boolean;
  /** score helper (or anyone who canEdit): may scan QR codes in bulk (points by event) and delete their own scan lines — nothing else */
  canScan: boolean;
  /** during camp: show the button that opens /teams. */
  showTeamsButton?: boolean;
  onTeams?: () => void;
  /** before/after camp, the scoreboard was opened from Teams. */
  teamsParent?: boolean;
}

type Pending = { team: Team; sign: 1 | -1 };

/**
 * Placar: every team ranked by its points. Game organizers (Settings →
 * Placar) and the admin give / take points — each with an optional note of
 * why. Bulk points (by name or by QR code, tied to a programme event) live
 * on their own page: "Pontos em massa"; score helpers only get that.
 *
 * Sub-pages (own URLs, so Back works):
 *   #/scoreboard/bulk        — Pontos em massa
 *   #/scoreboard/history     — the whole ledger, filterable
 *   #/scoreboard/team/:id    — where one team's points came from
 *   #/scoreboard/event/:id   — what one programme event produced
 */
export default function ScoreboardPage({ token, userId, canEdit, canScan, showTeamsButton = false, onTeams, teamsParent = false }: ScoreboardPageProps) {
  const { tx, te } = useI18n();
  const teams = useCollection("teams");
  const settings = useCollection("settings");
  const suspense = useScoreSuspense(settings?.scoreHideWindow);
  const [suspenseOpen, setSuspenseOpen] = useState(false);
  const scores = useCollectionOrEmpty("scores");
  const events = useCollectionOrEmpty("events");
  const { segments, navigate } = useRoute();
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const teamMap = useTeamMap(teams ?? []);
  const eventMap = useEventMap(events);

  const goHome = () => navigate("/scoreboard");
  const goTeam = (id: string) => navigate(`/scoreboard/team/${id}`);
  const goEvent = (id: string) => navigate(`/scoreboard/event/${id}`);
  const goHistory = () => navigate("/scoreboard/history");

  const totals = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of scores) m.set(e.teamId, (m.get(e.teamId) ?? 0) + e.points);
    return m;
  }, [scores]);
  const ranked = useMemo(() => (teams ?? []).slice().sort((a, b) => (totals.get(b.id) ?? 0) - (totals.get(a.id) ?? 0) || a.order - b.order), [teams, totals]);
  const top = ranked.length ? Math.max(1, ...ranked.map((t) => totals.get(t.id) ?? 0)) : 1;

  async function withBusy(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(te(err, "Algo deu errado."));
    } finally {
      setBusy(false);
    }
  }

  async function submitPoints(points: number, note: string) {
    if (!pending) return;
    const { team, sign } = pending;
    await withBusy(async () => {
      await addScore(token, { teamId: team.id, points: sign * Math.abs(points), note });
      setPending(null);
    });
  }

  const sub = segments[1];
  const canSeeHistory = canEdit || canScan;
  const backToRoot = teamsParent && onTeams ? onTeams : goHome;
  if (sub === "bulk" && canScan) return <BulkPointsPage token={token} onClose={backToRoot} parentLabel={teamsParent ? tx("Times") : tx("Placar")} />;
  if (sub === "history" && canSeeHistory) return <ScoreHistoryPage token={token} userId={userId} canEdit={canEdit} canScan={canScan} onBack={backToRoot} onTeam={goTeam} onEvent={goEvent} />;
  if (sub === "team" && segments[2] && canSeeHistory) return <TeamScorePage token={token} teamId={segments[2]} userId={userId} canEdit={canEdit} canScan={canScan} onBack={backToRoot} onEvent={goEvent} />;
  if (sub === "event" && segments[2] && canSeeHistory) return <EventScorePage token={token} eventId={segments[2]} userId={userId} canEdit={canEdit} canScan={canScan} onBack={backToRoot} onTeam={goTeam} />;

  /** the last few lines, so the organizer sees what just happened without leaving the board */
  const recent = scores.slice(0, 5);

  if (!teams) {
    return (
      <div className="admin-page">
        <p className="opt-empty">{tx("Sincronizando com o servidor… 🏕️")}</p>
      </div>
    );
  }

  // Suspense is active and this person does not launch points: show only the reveal message.
  // Team cards add no useful information without rankings or totals.
  if (suspense.kind === "on" && !canScan) {
    return (
      <div className="admin-page">
        {teamsParent && onTeams && <Breadcrumbs items={[{ label: tx("Times"), onClick: onTeams }, { label: tx("Placar") }]} />}
        <header className="admin-head">
          <h1 className="admin-title">🏆 {tx("Placar")}</h1>
        </header>
        <section className="suspense-hero">
          <img className="suspense-hero__img" src={ICONS.scoreSuspense} alt="" aria-hidden="true" />
          <h2 className="suspense-hero__title">🤫 {tx("Suspense!")}</h2>
          <p className="cat-hint">
            {tx("Os pontos estão escondidos. A revelação será")} <strong>{speakWhen(suspense.until)}</strong>.
          </p>
        </section>

      </div>
    );
  }

  return (
    <div className="admin-page">
      {teamsParent && onTeams && <Breadcrumbs items={[{ label: tx("Times"), onClick: onTeams }, { label: tx("Placar") }]} />}
      <header className="admin-head">
        <h1 className="admin-title">🏆 {tx("Placar")}</h1>
        <div className="admin-head__actions admin-head__actions--icons">
        {showTeamsButton && onTeams && teams.length > 0 && (
          <button type="button" className="button button--secondary admin-head__new" onClick={onTeams}>
            <img className="admin-head__action-icon" src={ICONS.team} alt="" aria-hidden="true" /><span className="admin-head__action-label">{tx("Times")}</span>
          </button>
        )}
        {canScan && teams.length > 0 && (
          <button type="button" className="button button--secondary admin-head__new" onClick={() => navigate("/scoreboard/bulk")}>
            📋 {tx("Pontos em massa")}
          </button>
        )}
        {canEdit && (
          <button type="button" className="button button--secondary admin-head__new" title={tx("Esconder o placar da equipe por um tempo")} onClick={() => setSuspenseOpen(true)}>
            <img className="admin-head__action-icon" src={ICONS.curtain} alt="" aria-hidden="true" /><span className="admin-head__action-label">{tx("Suspense")}</span>
          </button>
        )}
        </div>
      </header>
      {canScan && suspense.kind === "on" && (
        <p className="message message--warn scoreboard-suspense-status">
          <img className="scoreboard-suspense-status__icon" src={ICONS.curtain} alt="" aria-hidden="true" />
          <span>{tx("A equipe não está vendo o placar. Você vê tudo porque lança pontos.")}</span>
          {canEdit && (
            <>
              {" "}
              <button type="button" className="link-btn" onClick={() => setSuspenseOpen(true)}>
                {tx("alterar")}
              </button>
            </>
          )}
        </p>
      )}
      {canScan && suspense.kind === "scheduled" && (
        <p className="cat-hint scoreboard-intro">
          {tx("🕒 O placar some da equipe {from} e volta {until}.", { from: speakWhen(suspense.from), until: speakWhen(suspense.until) })}
          {canEdit && (
            <>
              {" "}
              <button type="button" className="link-btn" onClick={() => setSuspenseOpen(true)}>
                {tx("alterar")}
              </button>
            </>
          )}
        </p>
      )}
      {canScan && (
        <p className="admin-intro scoreboard-intro">
          {tx("📋 Pontos em massa dá pontos a várias crianças de uma vez — pelo nome ou lendo os crachás.")}
          {canSeeHistory && ` ${tx("Toque no nome do time para ver de onde vieram os pontos.")}`}
        </p>
      )}

      {error && <p className="message message--error">{error}</p>}

      {teams.length === 0 && <p className="opt-empty">{tx("Nenhum time cadastrado ainda.")}</p>}

      <ol className="score-list">
        {ranked.map((t, i) => {
          const pts = totals.get(t.id) ?? 0;
          const pct = Math.max(0, Math.min(100, (pts / top) * 100));
          return (
            <li key={t.id} className={`score-card ${i === 0 && pts > 0 ? "score-card--leader" : ""}`} style={{ borderLeftColor: t.color }}>
              <span className="score-card__wash" aria-hidden="true" style={{ width: `${pct}%`, background: t.color }} />
              <span className="score-card__rank" aria-label={tx("{n}º lugar", { n: i + 1 })}>
                {i === 0 && pts > 0 ? "🥇" : i === 1 && pts > 0 ? "🥈" : i === 2 && pts > 0 ? "🥉" : tx("{n}º", { n: i + 1 })}
              </span>
              <div className="score-card__body">
                {canSeeHistory ? (
                  <button type="button" className="score-card__name" title={tx("Ver de onde vieram os pontos")} onClick={() => goTeam(t.id)}>
                    {teamCardName(t.name)}
                  </button>
                ) : (
                  <span className="score-card__name">{teamCardName(t.name)}</span>
                )}
                <span className="score-card__bar" aria-hidden="true">
                  <span className="score-card__fill" style={{ width: `${pct}%`, background: t.color }} />
                </span>
              </div>
              <span className="score-card__points" style={{ background: t.color, color: contrastText(t.color) }}>
                {pts}
              </span>
              {canEdit && (
                <span className="score-card__actions">
                  <button type="button" className="icon-btn score-btn" title={tx("Dar pontos")} aria-label={tx("Dar pontos a {name}", { name: t.name })} disabled={busy} onClick={() => setPending({ team: t, sign: 1 })}>
                    ➕
                  </button>
                  <button type="button" className="icon-btn icon-btn--warn score-btn" title={tx("Tirar pontos")} aria-label={tx("Tirar pontos de {name}", { name: t.name })} disabled={busy} onClick={() => setPending({ team: t, sign: -1 })}>
                    ➖
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {canSeeHistory && scores.length > 0 && (
        <section className="score-section">
          <h2 className="score-section__title">
            📜 {tx("Últimos lançamentos")}
            <button type="button" className="link-btn score-section__clear" onClick={goHistory}>
              {tx("ver histórico completo")}
            </button>
          </h2>
          <ul className="score-recent">
            {recent.map((e) => {
              const kind = lineKind(e);
              const team = teamMap.get(e.teamId);
              const ev = e.eventId ? eventMap.get(e.eventId) : undefined;
              return (
                <li key={e.id} className="score-recent__item" style={{ borderLeftColor: team?.color ?? "#cfd8d2" }}>
                  <span className={`score-log__pts ${kind === "reset" ? "score-log__pts--reset" : e.points < 0 ? "score-log__pts--remove" : ""}`}>{fmtPoints(e.points)}</span>
                  <span className="score-recent__text">
                    {KIND_META[kind].emoji}{" "}
                    {kind === "scan" ? (
                      <>
                        <strong><LiveName id={e.camperId} /></strong>
                        {ev && (
                          <>
                            {" "}
                            {tx("em")}{" "}
                            <button type="button" className="link-btn" onClick={() => goEvent(ev.id)}>
                              {ev.emoji} {ev.title}
                            </button>
                          </>
                        )}
                      </>
                    ) : (
                      <strong>{e.note || tx(KIND_META[kind].label)}</strong>
                    )}
                    {team && (
                      <>
                        {" "}
                        ·{" "}
                        <button type="button" className="link-btn" style={{ color: team.color }} onClick={() => goTeam(team.id)}>
                          {team.name}
                        </button>
                      </>
                    )}
                    <small className="score-recent__meta">
                      {fmtShort(e.createdAt)} · <LiveName id={e.byPersonId} first />
                    </small>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {pending && <PointsDialog pending={pending} busy={busy} onSubmit={submitPoints} onClose={() => setPending(null)} />}
      {canEdit && <ScoreSuspenseDialog token={token} open={suspenseOpen} onClose={() => setSuspenseOpen(false)} current={settings?.scoreHideWindow} />}
    </div>
  );
}

const QUICK = [1, 2, 3, 5, 10, 20, 50, 100];

/** Names are stored as "Time Belém"; on phones the word Time is noise next to the score. */
function teamCardName(name: string) {
  const m = name.match(/^(times?\s+)/i);
  if (!m) return name;
  return (
    <>
      <span className="score-card__team-prefix">{m[1]}</span>
      {name.slice(m[1].length)}
    </>
  );
}

function PointsDialog({ pending, busy, onSubmit, onClose }: { pending: Pending; busy: boolean; onSubmit: (points: number, note: string) => Promise<void>; onClose: () => void }) {
  const { tx } = useI18n();
  const { team, sign } = pending;
  const [points, setPoints] = useState<number>(10);
  const [note, setNote] = useState("");
  const title = sign > 0 ? tx("➕ Dar pontos a {name}", { name: team.name }) : tx("➖ Tirar pontos de {name}", { name: team.name });
  const valid = Number.isInteger(points) && points > 0;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    void onSubmit(points, note.trim());
  }

  return (
    <Dialog open onClose={onClose} title={title} width={480}>
      <form className="cat-form cat-form--plain" onSubmit={submit}>
        <h2 className={`cat-form__title ${styles.teamTitle}`} style={{ "--team": team.color } as CSSProperties}>
          {title}
        </h2>
        <div className="cat-field">
            <span className="cat-field__label">{tx("Quantos pontos?")}</span>
            <div className="chip-group">
              {QUICK.map((q) => (
                <button key={q} type="button" className={`chip-toggle chip-toggle--small ${points === q ? "chip-toggle--on" : ""}`} aria-pressed={points === q} disabled={busy} onClick={() => setPoints(q)}>
                  {q}
                </button>
              ))}
            </div>
            <input
              className="cat-input"
              type="number"
              min={1}
              max={100000}
              step={1}
              value={Number.isFinite(points) ? points : ""}
              onChange={(e) => {
                const raw = e.target.value;
                setPoints(raw === "" ? Number.NaN : Number(raw));
              }}
              disabled={busy}
              aria-label={tx("Pontos")}
            />
          </div>
        <label className="cat-field">
          <span className="cat-field__label">{tx("Observação (opcional)")}</span>
          <input className="cat-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={sign > 0 ? tx("Ex.: Arrumaram todo o refeitório") : tx("Ex.: Não arrumou a cama")} maxLength={200} disabled={busy} autoFocus />
        </label>
        <div className="cat-form__actions">
          <button type="button" className="button button--secondary" disabled={busy} onClick={onClose}>
            {tx("Cancelar")}
          </button>
          <button type="submit" className="button button--primary" disabled={busy || !valid}>
            {sign > 0
              ? points === 1
                ? tx("Dar {n} ponto", { n: points })
                : tx("Dar {n} pontos", { n: points })
              : points === 1
                ? tx("Tirar {n} ponto", { n: points })
                : tx("Tirar {n} pontos", { n: points })}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
