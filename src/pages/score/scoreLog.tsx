import { useMemo } from "react";
import type { ScoreEntry } from "../../api/scores";
import type { CampEvent } from "../../api/schedule";
import { dayKey, speakDay, speakStamp, speakTime } from "../../dates";
import type { Team } from "../../api/teams";
import { useNames } from "../../store/people";
import { useI18n } from "../../i18n";

/**
 * Shared bits of the scoreboard history pages (Placar → Histórico / Time /
 * Evento): how a ledger line is classified, formatted and listed.
 */

/** a line's origin: a wristband scan tied to a programme event, or a manual give / take / reset */
export type LineKind = "scan" | "add" | "remove" | "reset";
export type KindFilter = "all" | LineKind;

export function lineKind(e: ScoreEntry): LineKind {
  return e.camperId ? "scan" : e.kind;
}

export const KIND_META: Record<LineKind, { label: string; emoji: string; plural: string }> = {
  scan: { label: "Crachá lido", emoji: "🎯", plural: "Crachás lidos" },
  add: { label: "Pontos dados", emoji: "➕", plural: "Pontos dados" },
  remove: { label: "Pontos tirados", emoji: "➖", plural: "Pontos tirados" },
  reset: { label: "Zerado", emoji: "🧹", plural: "Zerados" },
};

export function fmtPoints(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

export const fmtTime = speakTime;
export const fmtShort = speakStamp;

export interface DayGroup {
  key: string;
  label: string;
  entries: ScoreEntry[];
  /** net points of the day (over the entries shown) */
  total: number;
}

/** Newest day first; entries keep their own order (the store is newest first). */
export function groupByDay(entries: ScoreEntry[]): DayGroup[] {
  const map = new Map<string, DayGroup>();
  for (const e of entries) {
    const key = dayKey(e.createdAt);
    let g = map.get(key);
    if (!g) {
      g = { key, label: speakDay(key), entries: [], total: 0 };
      map.set(key, g);
    }
    g.entries.push(e);
    g.total += e.points;
  }
  return [...map.values()].sort((a, b) => b.key.localeCompare(a.key));
}

export function eventLabel(e: CampEvent, withDate = true): string {
  const when = withDate ? ` · ${speakDay(e.date, "short")} ${e.startTime}` : "";
  return `${e.emoji} ${e.title}${when}`.trim();
}

/** Per-event summary of the scan lines: value per kid, how many kids, per team. */
export interface EventSummary {
  eventId: string;
  event: CampEvent | null;
  /** points every scan of the event carries (they are all the same) */
  perKid: number;
  kids: number;
  total: number;
  perTeam: Map<string, { kids: number; total: number }>;
  /** newest scan of the event */
  lastAt: string;
}

export function summarizeEvents(entries: ScoreEntry[], events: CampEvent[]): EventSummary[] {
  const byId = new Map(events.map((e) => [e.id, e]));
  const map = new Map<string, EventSummary>();
  for (const e of entries) {
    if (!e.eventId || !e.camperId) continue;
    let s = map.get(e.eventId);
    if (!s) {
      s = { eventId: e.eventId, event: byId.get(e.eventId) ?? null, perKid: e.points, kids: 0, total: 0, perTeam: new Map(), lastAt: e.createdAt };
      map.set(e.eventId, s);
    }
    s.kids += 1;
    s.total += e.points;
    if (e.createdAt > s.lastAt) s.lastAt = e.createdAt;
    const t = s.perTeam.get(e.teamId) ?? { kids: 0, total: 0 };
    t.kids += 1;
    t.total += e.points;
    s.perTeam.set(e.teamId, t);
  }
  // programme order (unknown events last, by last scan)
  return [...map.values()].sort((a, b) => {
    if (a.event && b.event) return a.event.date.localeCompare(b.event.date) || a.event.startTime.localeCompare(b.event.startTime);
    if (a.event) return -1;
    if (b.event) return 1;
    return b.lastAt.localeCompare(a.lastAt);
  });
}

export function useTeamMap(teams: Team[]): Map<string, Team> {
  return useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
}
export function useEventMap(events: CampEvent[]): Map<string, CampEvent> {
  return useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);
}

export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Who may remove a line: organizers any line; a score helper only their OWN scans. */
export function canDeleteLine(e: ScoreEntry, opts: { canEdit: boolean; canScan: boolean; userId: string }): boolean {
  if (opts.canEdit) return true;
  return opts.canScan && !!e.camperId && e.byPersonId === opts.userId;
}

interface ScoreLogListProps {
  entries: ScoreEntry[];
  teams: Map<string, Team>;
  events: Map<string, CampEvent>;
  /** hide the team column (the list is already about one team) */
  hideTeam?: boolean;
  /** hide the event column (the list is already about one event) */
  hideEvent?: boolean;
  onTeam?: (teamId: string) => void;
  onEvent?: (eventId: string) => void;
  canDelete?: (e: ScoreEntry) => boolean;
  onDelete?: (e: ScoreEntry) => void;
  deletingId?: string | null;
  /** group the lines under a day heading (with the day's net points) */
  byDay?: boolean;
  emptyText?: string;
}

/** The ledger lines, newest first — each says what, who, why and when. */
export function ScoreLogList({ entries, teams, events, hideTeam, hideEvent, onTeam, onEvent, canDelete, onDelete, deletingId, byDay = true, emptyText }: ScoreLogListProps) {
  const { tx } = useI18n();
  /** the lines hold person ids only (the kid scanned, who launched it): names read live */
  const nameOf = useNames(entries.flatMap((e) => [e.camperId, e.byPersonId]));
  const empty = emptyText ?? tx("Nenhum lançamento.");
  if (entries.length === 0) return <p className="opt-empty">{empty}</p>;
  const groups = byDay ? groupByDay(entries) : [{ key: "all", label: "", entries, total: 0 }];
  return (
    <div className="score-days">
      {groups.map((g) => (
        <section key={g.key} className="score-day">
          {byDay && (
            <h3 className="score-day__title">
              <span>{g.label}</span>
              <span className="score-day__meta">
                {g.entries.length === 1 ? tx("{n} lançamento", { n: g.entries.length }) : tx("{n} lançamentos", { n: g.entries.length })} · <strong className={g.total < 0 ? "score-neg" : "score-pos"}>{fmtPoints(g.total)}</strong>
              </span>
            </h3>
          )}
          <ul className="score-log">
            {g.entries.map((e) => (
              <ScoreLogItem key={e.id} entry={e} nameOf={nameOf} team={teams.get(e.teamId)} event={e.eventId ? events.get(e.eventId) : undefined} hideTeam={hideTeam} hideEvent={hideEvent} onTeam={onTeam} onEvent={onEvent} deletable={!!onDelete && !!canDelete?.(e)} deleting={deletingId === e.id} onDelete={onDelete} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

interface ItemProps {
  entry: ScoreEntry;
  nameOf: (personId: string | null | undefined) => string;
  team?: Team;
  event?: CampEvent;
  hideTeam?: boolean;
  hideEvent?: boolean;
  onTeam?: (teamId: string) => void;
  onEvent?: (eventId: string) => void;
  deletable: boolean;
  deleting: boolean;
  onDelete?: (e: ScoreEntry) => void;
}

function ScoreLogItem({ entry: e, nameOf, team, event, hideTeam, hideEvent, onTeam, onEvent, deletable, deleting, onDelete }: ItemProps) {
  const { tx } = useI18n();
  const kind = lineKind(e);
  const meta = KIND_META[kind];
  const ptsClass = kind === "reset" ? "score-log__pts--reset" : e.points < 0 ? "score-log__pts--remove" : "";
  // a scan line's note is just the event title — the event chip already says it
  const showNote = e.note && !(kind === "scan" && event && e.note === `${event.emoji} ${event.title}`.trim());
  return (
    <li className={`score-log__item score-log__item--${kind}`} style={{ borderLeftColor: team?.color ?? "#cfd8d2" }}>
      <span className={`score-log__pts ${ptsClass}`}>{fmtPoints(e.points)}</span>
      <div className="score-log__body">
        <span className="score-log__line">
          <span className="score-log__kind" title={tx(meta.label)}>
            {meta.emoji}
          </span>{" "}
          {kind === "scan" ? (
            <>
              <strong>{nameOf(e.camperId) || tx("Criança")}</strong>
              {!hideEvent && (
                <>
                  {" "}
                  {tx("em")}{" "}
                  {event ? (
                    onEvent ? (
                      <button type="button" className="link-btn" onClick={() => onEvent(event.id)}>
                        {event.emoji} {event.title}
                      </button>
                    ) : (
                      <strong>
                        {event.emoji} {event.title}
                      </strong>
                    )
                  ) : (
                    <em>{tx("evento removido")}</em>
                  )}
                </>
              )}
            </>
          ) : (
            <strong>{tx(meta.label)}</strong>
          )}
          {!hideTeam && (
            <>
              {" "}
              ·{" "}
              {team ? (
                onTeam ? (
                  <button type="button" className="link-btn" style={{ color: team.color }} onClick={() => onTeam(team.id)}>
                    {team.name}
                  </button>
                ) : (
                  <strong>{team.name}</strong>
                )
              ) : (
                <em>{tx("time removido")}</em>
              )}
            </>
          )}
        </span>
        {showNote && <span className="score-log__note">“{e.note}”</span>}
        <span className="score-log__meta">
          {fmtTime(e.createdAt)} · {tx("por {name}", { name: nameOf(e.byPersonId) || "…" })}
        </span>
      </div>
      {deletable && (
        <button type="button" className="icon-btn icon-btn--danger score-log__del" title={tx("Apagar lançamento (desfaz os pontos)")} aria-label={tx("Apagar lançamento")} disabled={deleting} onClick={() => onDelete?.(e)}>
          {deleting ? "…" : "🗑️"}
        </button>
      )}
    </li>
  );
}
