import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { deleteScore, repointEventScans, scanScore } from "../api/scores";
import { speakDay } from "../dates";
import { useCollection, useCollectionOrEmpty } from "../store";
import Breadcrumbs from "../components/Breadcrumbs";
import SearchField from "../components/SearchField";
import ScanFab from "../components/ScanFab";
import ScanPointsDialog, { currentEvent, defaultEvent } from "../components/ScanPointsDialog";
import { useNames } from "../store/people";
import { collatorLocale, useI18n } from "../i18n";

interface BulkPointsPageProps {
  token: string;
  /** back to the scoreboard or its parent Teams page */
  onClose: () => void;
  parentLabel?: string;
}

const POINTS_MAX = 100_000;
/** how long a tapped row celebrates (with an undo at hand) before sliding down to "já receberam" — matches `bulk-leave` in styles.css */
const CHEER_MS = 3000;

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Bulk points by NAME (no camera): pick the programme event (default: the
 * one happening now), set the points every kid of that event earns, then
 * tap the kids who have not received them yet. Same rules as the QR scan —
 * a kid counts once per event, one value per event — so both modes share
 * the same ledger lines. Only kids who did the church check-in are listed:
 * by name there is no wristband to prove the kid is here (the QR scan, on
 * the other hand, checks the kid in by itself).
 */
export default function BulkPointsPage({ token, onClose, parentLabel }: BulkPointsPageProps) {
  const { tx } = useI18n();
  const events = useCollection("events");
  const campers = useCollectionOrEmpty("campers");
  const scores = useCollectionOrEmpty("scores");
  const teams = useCollectionOrEmpty("teams");
  const sorted = useMemo(() => (events ?? []).slice().sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)), [events]);
  const current = useMemo(() => currentEvent(sorted), [sorted]);
  const initial = useMemo(() => defaultEvent(sorted), [sorted]);
  const resolvedParent = parentLabel ?? tx("Placar");

  const [eventId, setEventId] = useState<string>(initial?.id ?? "");
  const [points, setPoints] = useState<number>(1);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  /** kids just given points (camperId → the new score line): stay in the list while the celebration plays, undo at hand, then slide down to "já receberam" */
  const [cheering, setCheering] = useState<Map<string, string>>(new Map());
  const cheerTimers = useRef(new Map<string, number>());
  function stopCheer(camperId: string) {
    const t = cheerTimers.current.get(camperId);
    if (t) window.clearTimeout(t);
    cheerTimers.current.delete(camperId);
    setCheering((m) => {
      const n = new Map(m);
      n.delete(camperId);
      return n;
    });
  }
  const [undoingId, setUndoingId] = useState<string | null>(null);
  // the camera is the default way in; close it to find a kid without the wristband by name
  const [scanning, setScanning] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [repointing, setRepointing] = useState(false);

  const event = sorted.find((e) => e.id === eventId) ?? null;
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const eventScans = useMemo(() => scores.filter((s) => s.eventId === eventId && s.camperId), [scores, eventId]);
  const scannedIds = useMemo(() => new Set(eventScans.map((s) => s.camperId as string)), [eventScans]);
  const eventPoints = eventScans[0]?.points ?? null;
  /** score lines carry person ids only (the kid, who launched it): names read live */
  const nameOf = useNames(eventScans.flatMap((s) => [s.camperId, s.byPersonId]));

  // the page may open before the programme arrives: adopt the default once it does
  const defaulted = useRef(!!initial);
  useEffect(() => {
    if (!defaulted.current && initial) {
      defaulted.current = true;
      setEventId((id) => id || initial.id);
    }
  }, [initial]);

  useEffect(() => {
    setError(null);
    if (eventPoints !== null) setPoints(eventPoints);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  useEffect(() => () => cheerTimers.current.forEach((t) => window.clearTimeout(t)), []);

  const notArrived = useMemo(() => campers.filter((c) => !c.checkin).length, [campers]);
  /** checked-in kids still without points for this event (plus the ones mid-celebration), filtered by name */
  const pending = useMemo(() => {
    const q = normalize(search.trim());
    return campers
      .filter((c) => c.checkin && (!scannedIds.has(c.id) || cheering.has(c.id)) && (!q || normalize(c.name).includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name, collatorLocale()));
  }, [campers, scannedIds, cheering, search]);
  const pendingCount = pending.length - [...cheering.keys()].filter((id) => pending.some((c) => c.id === id)).length;

  const pointsValid = Number.isInteger(points) && points >= 1 && points <= POINTS_MAX;
  const pointsDiverge = pointsValid && eventPoints !== null && eventPoints !== points;

  async function give(camperId: string) {
    if (busyId || !eventId || !pointsValid) return;
    setBusyId(camperId);
    setError(null);
    try {
      const res = await scanScore(token, { camperId, eventId, points });
      setCheering((m) => new Map(m).set(camperId, res.score.id));
      cheerTimers.current.set(camperId, window.setTimeout(() => stopCheer(camperId), CHEER_MS));
    } catch (e) {
      setError(e instanceof Error ? e.message : tx("Algo deu errado."));
    } finally {
      setBusyId(null);
    }
  }

  /** undo: removes the line, the kid goes back to the "sem pontos" list (mid-celebration: the row simply stays where it is) */
  async function undo(scoreId: string, camperId?: string) {
    if (undoingId) return;
    setUndoingId(scoreId);
    setError(null);
    try {
      await deleteScore(token, scoreId);
    } catch (e) {
      setError(e instanceof Error ? e.message : tx("Algo deu errado."));
    } finally {
      setUndoingId(null);
      if (camperId) stopCheer(camperId);
    }
  }

  async function applyRepoint() {
    if (!eventId || !pointsValid || repointing) return;
    setRepointing(true);
    setError(null);
    try {
      await repointEventScans(token, eventId, points);
    } catch (e) {
      setError(e instanceof Error ? e.message : tx("Algo deu errado."));
    } finally {
      setRepointing(false);
    }
  }

  return (
    <div className="admin-page bulk-points">
      <Breadcrumbs items={[{ label: resolvedParent, onClick: onClose }, { label: tx("Pontos em massa") }]} />
      <header className="admin-head">
        <h1 className="admin-title">📋 {tx("Pontos em massa")}</h1>
      </header>
      <p className="admin-intro">
        {tx("Toque no nome da criança: o time dela ganha")} {pointsValid ? points : "—"} {points !== 1 ? tx("pontos") : tx("ponto")}. {tx("Uma vez por criança neste evento.")}
      </p>

      <div className="cat-form cat-form--plain">

        <div className="scan-points__fields">
          <label className="cat-field">
            <span className="cat-field__label">{tx("Evento")}</span>
            <select className="cat-input" value={eventId} onChange={(e) => setEventId(e.target.value)}>
              <option value="">{sorted.length ? tx("Escolha o evento…") : tx("Sem programação")}</option>
              {sorted.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.emoji} {e.title} · {speakDay(e.date, "short")} {e.startTime}
                  {e.id === current?.id ? tx(" (agora)") : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="cat-field scan-points__points">
            <span className="cat-field__label">{tx("Qtd.")}</span>
            <input
              className="cat-input"
              type="number"
              inputMode="numeric"
              min={1}
              max={POINTS_MAX}
              step={1}
              value={Number.isFinite(points) ? points : ""}
              onChange={(e) => {
                const raw = e.target.value;
                setPoints(raw === "" ? Number.NaN : Math.floor(Number(raw)));
              }}
              aria-label={tx("Pontos por criança")}
            />
          </label>
        </div>
        {!eventId && sorted.length > 0 && <p className="cat-hint cat-hint--error">{tx("Escolha o evento para liberar a lista.")}</p>}
        {pointsDiverge && (
          <p className="cat-hint cat-hint--error scan-points__repoint">
            ⚠️{" "}
            {eventScans.length === 1 ? tx("{n} criança já com", { n: eventScans.length }) : tx("{n} crianças já com", { n: eventScans.length })}{" "}
            <strong>{eventPoints}</strong> {eventPoints === 1 ? tx("ponto") : tx("pontos")}. {tx("O valor é um só por evento: o próximo lançamento (ou o botão) muda todas para")} <strong>{points}</strong>.{" "}
            <button type="button" className="button button--secondary scan-points__repoint-btn" disabled={repointing} onClick={() => void applyRepoint()}>
              {repointing ? tx("Atualizando…") : tx("Atualizar todas para {n}", { n: points })}
            </button>
          </p>
        )}
        {error && <p className="message message--error">{error}</p>}

        {event && (
          <>
            <SearchField placeholder={tx("Buscar pelo nome…")} value={search} onChange={setSearch} aria-label={tx("Buscar criança")} />
            <p className="scan-points__summary" aria-live="polite">
              <strong>{eventScans.length}</strong> {tx("com pontos")} · <strong>{pendingCount}</strong> {tx("sem pontos")}
              {notArrived > 0 && (
                <span className="scan-points__summary-hint">
                  · {tx("{n} sem check-in (só pelo crachá)", { n: notArrived })}
                </span>
              )}
            </p>
            {pending.length === 0 ? (
              <p className="opt-empty">{search ? tx("Ninguém com check-in e sem pontos com esse nome.") : tx("Todas as crianças com check-in já receberam os pontos deste evento. 🎉")}</p>
            ) : (
              <ul className="bulk-points__list">
                {pending.map((c) => {
                  const team = c.team ? teamById.get(c.team) : undefined;
                  const scoreId = cheering.get(c.id);
                  if (scoreId) {
                    const undoing = undoingId === scoreId;
                    return (
                      <li key={c.id} className={undoing ? "bulk-points__item--undoing" : "bulk-points__item--leaving"}>
                        <div className="bulk-points__kid bulk-points__kid--cheer" style={{ borderLeftColor: team?.color ?? "#ccc" }}>
                          <span className="bulk-points__name">{c.name || "…"}</span>
                          <small className="bulk-points__team">
                            {team?.name ?? tx("sem time")} · +{points}
                          </small>
                          <span className="bulk-points__cheer-actions">
                            <span className="bulk-points__plus bulk-points__plus--given" aria-hidden="true">
                              ✓ +{points}
                            </span>
                            <button type="button" className="link-btn bulk-points__undo" disabled={!!undoingId} onClick={() => void undo(scoreId, c.id)}>
                              {undoing ? "…" : tx("↩︎ Desfazer")}
                            </button>
                          </span>
                          {!undoing && (
                            <span className="bulk-points__burst" aria-hidden="true">
                              {["🎉", "⭐", "✨", "🎊", "⭐", "✨"].map((g, i) => (
                                <i key={i} style={{ "--i": i } as CSSProperties}>
                                  {g}
                                </i>
                              ))}
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  }
                  return (
                    <li key={c.id}>
                      <button type="button" className="bulk-points__kid" disabled={!!busyId || !pointsValid || !team} onClick={() => void give(c.id)} style={{ borderLeftColor: team?.color ?? "#ccc" }}>
                        <span className="bulk-points__name">{c.name || "…"}</span>
                        <small className="bulk-points__team">{team ? team.name : tx("sem time")}</small>
                        <span className="bulk-points__plus" aria-hidden="true">
                          {busyId === c.id ? "…" : `+${pointsValid ? points : "—"}`}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {eventScans.length > 0 && (
              <section className="bulk-points__done">
                <h3 className="bulk-points__done-title">{tx("Já receberam")}</h3>
                <ul className="bulk-points__list">
                  {eventScans
                    .filter((s) => !cheering.has(s.camperId as string))
                    .map((s) => {
                      const team = teamById.get(s.teamId);
                      return (
                        <li key={s.id} className="bulk-points__kid bulk-points__kid--done" style={{ borderLeftColor: team?.color ?? "#ccc" }}>
                          <span className="bulk-points__name">{nameOf(s.camperId) || "…"}</span>
                          <small className="bulk-points__team">
                            {team?.name ?? tx("Time removido")} · +{s.points} · {nameOf(s.byPersonId).split(" ")[0] || "…"}
                          </small>
                          <button type="button" className="link-btn bulk-points__undo" disabled={!!undoingId} onClick={() => void undo(s.id)}>
                            {undoingId === s.id ? "…" : tx("↩︎ Desfazer")}
                          </button>
                        </li>
                      );
                    })}
                </ul>
              </section>
            )}
          </>
        )}

      </div>

      <ScanFab label={tx("Ler os crachás com a câmera")} onClick={() => setScanning(true)} />
      {scanning && (
        <ScanPointsDialog
          token={token}
          initialEventId={eventId}
          initialPoints={pointsValid ? points : undefined}
          onChange={({ eventId: e, points: p }) => {
            // a kid without the wristband: close the camera and find them by name — same event, same points
            if (e) setEventId(e);
            if (Number.isInteger(p) && p >= 1) setPoints(p);
          }}
          onClose={() => setScanning(false)}
        />
      )}
    </div>
  );
}
