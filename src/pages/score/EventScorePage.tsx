import { useMemo, useState } from "react";
import { deleteScore, type ScoreEntry } from "../../api/scores";
import { speakDay } from "../../dates";
import { contrastText } from "../../api/teams";
import Breadcrumbs from "../../components/Breadcrumbs";
import { useConfirm } from "../../components/ConfirmDialog";
import { useCollectionOrEmpty } from "../../store";
import { canDeleteLine, fmtPoints, ScoreLogList, useEventMap, useTeamMap } from "./scoreLog";
import { useNames } from "../../store/people";
import { collatorLocale, useI18n } from "../../i18n";

interface Props {
  token: string;
  eventId: string;
  userId: string;
  canEdit: boolean;
  canScan: boolean;
  onBack: () => void;
  onTeam: (teamId: string) => void;
}

/**
 * Placar → Evento: everything the event produced on the scoreboard. Points
 * per kid, how many kids were read, the split per team (and who is still
 * missing), and every scan line with who read it and when.
 */
export default function EventScorePage({ token, eventId, userId, canEdit, canScan, onBack, onTeam }: Props) {
  const { tx } = useI18n();
  const scores = useCollectionOrEmpty("scores");
  const teams = useCollectionOrEmpty("teams");
  const events = useCollectionOrEmpty("events");
  const campers = useCollectionOrEmpty("campers");
  const teamMap = useTeamMap(teams);
  const eventMap = useEventMap(events);
  const confirm = useConfirm();
  const event = eventMap.get(eventId);

  const [teamFilter, setTeamFilter] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lines = useMemo(() => scores.filter((e) => e.eventId === eventId), [scores, eventId]);
  const scans = useMemo(() => lines.filter((e) => e.camperId), [lines]);
  const perKid = scans[0]?.points ?? 0;
  const total = useMemo(() => lines.reduce((s, e) => s + e.points, 0), [lines]);
  const scannedIds = useMemo(() => new Set(scans.map((s) => s.camperId as string)), [scans]);
  /** who read the badges (person ids — names read live) */
  const nameOf = useNames([...scans.map((s) => s.byPersonId), ...scans.map((s) => s.camperId)]);
  const readers = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of scans) m.set(s.byPersonId, (m.get(s.byPersonId) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [scans]);

  const perTeam = useMemo(() => {
    return teams
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((t) => {
        const kids = campers.filter((c) => c.team === t.id);
        const read = kids.filter((c) => scannedIds.has(c.id));
        const missing = kids.filter((c) => !scannedIds.has(c.id)).sort((a, b) => a.name.localeCompare(b.name, collatorLocale()));
        const pts = scans.filter((s) => s.teamId === t.id).reduce((sum, s) => sum + s.points, 0);
        return { team: t, kids: kids.length, read: read.length, missing, pts };
      });
  }, [teams, campers, scannedIds, scans]);

  const filtered = useMemo(() => (teamFilter ? lines.filter((e) => e.teamId === teamFilter) : lines), [lines, teamFilter]);

  async function remove(e: ScoreEntry) {
    if (
      !(await confirm({
        title: tx("Apagar esta leitura?"),
        message: tx("{name} volta para a lista de quem ainda não recebeu; {pts} sai do time.", {
          name: nameOf(e.camperId) || tx("A criança"),
          pts: fmtPoints(e.points),
        }),
        confirmLabel: tx("Apagar"),
        danger: true,
        emoji: "🗑️",
      }))
    )
      return;
    setDeletingId(e.id);
    setError(null);
    try {
      await deleteScore(token, e.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : tx("Algo deu errado."));
    } finally {
      setDeletingId(null);
    }
  }

  const title = event ? `${event.emoji} ${event.title}` : tx("Evento removido");

  return (
    <div className="admin-page">
      <Breadcrumbs items={[{ label: tx("Placar"), onClick: onBack }, { label: title }]} />
      <header className="admin-head">
        <h1 className="admin-title">{title}</h1>
      </header>
      {event && (
        <p className="admin-intro">
          {speakDay(event.date)} · {event.startTime}
          {event.endTime ? `–${event.endTime}` : ""}
        </p>
      )}

      <div className="stat-grid">
        <div className="stat-card stat-card--static">
          <span className="stat-card__emoji">🎯</span>
          <span className="stat-card__n">{scans.length}</span>
          <span className="stat-card__label">{tx("crachás lidos de {n}", { n: campers.length })}</span>
        </div>
        <div className="stat-card stat-card--static">
          <span className="stat-card__emoji">⭐</span>
          <span className="stat-card__n">{perKid}</span>
          <span className="stat-card__label">{perKid === 1 ? tx("ponto por criança") : tx("pontos por criança")}</span>
        </div>
        <div className="stat-card stat-card--static">
          <span className="stat-card__emoji">🏆</span>
          <span className="stat-card__n">{fmtPoints(total)}</span>
          <span className="stat-card__label">{tx("no placar")}</span>
        </div>
      </div>

      {readers.length > 0 && (
        <p className="admin-intro">
          {tx("Lido por")}{" "}
          {readers.map(([personId, n], i) => (
            <span key={personId}>
              {i > 0 && ", "}
              <strong>{nameOf(personId) || "…"}</strong> ({n})
            </span>
          ))}
          .
        </p>
      )}

      {error && <p className="message message--error">{error}</p>}

      <section className="score-section">
        <h2 className="score-section__title">🚩 {tx("Por time")}</h2>
        <ul className="score-events">
          {perTeam.map(({ team, kids, read, missing, pts }) => (
            <li key={team.id}>
              <div className={`score-event score-event--static ${teamFilter === team.id ? "score-event--on" : ""}`} style={{ borderLeftColor: team.color }}>
                <button type="button" className="score-event__name link-btn" style={{ color: team.color }} onClick={() => onTeam(team.id)}>
                  {team.name}
                </button>
                <small className="score-event__meta">
                  {kids === 1 ? tx("{read} de {kids} criança", { read, kids }) : tx("{read} de {kids} crianças", { read, kids })}
                  {missing.length > 0 && (
                    <>
                      {" "}
                      · {tx("faltam:")} <MissingNames names={missing.map((c) => c.name || "…")} />
                    </>
                  )}
                </small>
                <span className="score-event__side">
                  <span className="score-event__pts" style={{ background: team.color, color: contrastText(team.color) }}>
                    {fmtPoints(pts)}
                  </span>
                  <button type="button" className="link-btn score-event__filter" aria-pressed={teamFilter === team.id} onClick={() => setTeamFilter(teamFilter === team.id ? "" : team.id)}>
                    {teamFilter === team.id ? tx("todas") : tx("só este")}
                  </button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="score-section">
        <h2 className="score-section__title">
          📜 {tx("Leituras")}
          {teamFilter ? ` · ${teamMap.get(teamFilter)?.name ?? ""}` : ""}
          {teamFilter && (
            <button type="button" className="link-btn score-section__clear" onClick={() => setTeamFilter("")}>
              {tx("ver todas")}
            </button>
          )}
        </h2>
        <ScoreLogList entries={filtered} teams={teamMap} events={eventMap} hideEvent onTeam={onTeam} canDelete={(e) => canDeleteLine(e, { canEdit, canScan, userId })} onDelete={remove} deletingId={deletingId} emptyText={tx("Ninguém foi lido neste evento ainda.")} />
      </section>
    </div>
  );
}

/** "Ana, Bia, Caio e mais 4" — expandable */
function MissingNames({ names }: { names: string[] }) {
  const { tx } = useI18n();
  const [open, setOpen] = useState(false);
  const first = (n: string) => n.split(" ")[0];
  if (open || names.length <= 3) return <>{names.map(first).join(", ")}</>;
  return (
    <>
      {names.slice(0, 3).map(first).join(", ")}{" "}
      <button type="button" className="link-btn" onClick={() => setOpen(true)}>
        {tx("e mais {n}", { n: names.length - 3 })}
      </button>
    </>
  );
}
