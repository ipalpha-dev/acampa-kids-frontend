import { command } from "./client";
import { bearer } from "../auth/store";

/**
 * One line of the scoreboard ledger: points given to (positive) or taken
 * from (negative) a team. A team's score is the sum of its lines; "zerar"
 * writes a `reset` line cancelling the total, so nothing is ever lost.
 */
export interface ScoreEntry {
  id: string;
  teamId: string;
  points: number;
  kind: "add" | "remove" | "reset";
  note: string;
  /** set when the line came from scanning a kid's QR code: the kid whose team earned the points */
  camperId: string | null;
  /** the programme event the scan belongs to — a kid counts once per event (across devices) and every scan of an event carries the same points */
  eventId: string | null;
  /** who launched it (person id — name read live) */
  byPersonId: string;
  createdAt: string;
}

export interface ScanScoreResult {
  /** the scanned kid's FIRST name (live) */
  camperName?: string;
  score: ScoreEntry;
  team: { id: string; name: string; color: string };
  /** the kid had no church check-in yet: the system checked them in with this scan */
  checkedIn: boolean;
}

const json = (token: string) => ({ ...bearer(token), "content-type": "application/json" });

/** `points` > 0 gives, < 0 takes. */
export async function addScore(token: string, input: { teamId: string; points: number; note?: string }): Promise<ScoreEntry> {
  const res = await command<{ score: ScoreEntry }>("/api/scores", { method: "POST", headers: json(token), body: JSON.stringify(input) }, ["scores"]);
  return res.score;
}

/** Bulk giving at a door: the scanned kid's TEAM gets `points` (> 0) for the event; a kid counts once per event. A new value re-points the event's earlier scans. */
export async function scanScore(token: string, input: { camperId: string; eventId: string; points: number }): Promise<ScanScoreResult> {
  return command<ScanScoreResult>("/api/scores/scan", { method: "POST", headers: json(token), body: JSON.stringify(input) }, ["scores"]);
}

/** Changes the points of every scan already made for the event. Returns how many lines changed. */
export async function repointEventScans(token: string, eventId: string, points: number): Promise<number> {
  const res = await command<{ changed: number }>(`/api/scores/scan/${eventId}`, { method: "PUT", headers: json(token), body: JSON.stringify({ points }) }, ["scores"]);
  return res.changed;
}

/** Zeroes the team (writes a line cancelling its current total). */
export async function resetScore(token: string, teamId: string, note = ""): Promise<ScoreEntry> {
  const res = await command<{ score: ScoreEntry }>(`/api/scores/reset/${teamId}`, { method: "POST", headers: json(token), body: JSON.stringify({ note }) }, ["scores"]);
  return res.score;
}

/** The suspense window: between `from` and `until` the team sees the Placar with the totals hidden (points keep being written). Both null clears it. Admin, organizer or game organizer. */
export async function setScoreSuspense(token: string, window: { from: string | null; until: string | null }): Promise<void> {
  await command("/api/scores/suspense", { method: "PUT", headers: json(token), body: JSON.stringify(window) }, ["settings"]);
}

/** Removes one line (a mistake) — its points are undone. */
export async function deleteScore(token: string, id: string): Promise<void> {
  await command(`/api/scores/${id}`, { method: "DELETE", headers: bearer(token) }, ["scores"]);
}
