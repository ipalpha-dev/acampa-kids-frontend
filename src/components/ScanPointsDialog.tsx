import { useEffect, useMemo, useRef, useState } from "react";
import QrScanner from "qr-scanner";
import { repointEventScans, scanScore } from "../api/scores";
import { type CampEvent } from "../api/schedule";
import { speakDay } from "../dates";
import { camperIdFromQr } from "../print/camperLabels";
import { useCollection, useCollectionOrEmpty } from "../store";
import Dialog from "./Dialog";
import { keepOverlayInPlace, visibleScanRegion } from "./scanOverlay";
import { QrGlyph } from "./Glyph";
import { useI18n } from "../i18n";

interface ScanPointsDialogProps {
  token: string;
  onClose: () => void;
  /** event / points already chosen on the page that opened the scanner (Pontos em massa) */
  initialEventId?: string;
  initialPoints?: number;
  /** the event / points chosen inside the scanner, so the page behind stays on the same round after closing */
  onChange?: (state: { eventId: string; points: number }) => void;
}

type Flash = { kind: "ok"; text: string; color: string } | { kind: "error"; text: string };

const FLASH_MS = 1400;
const POINTS_MAX = 100_000;

/** "HH:mm" and "YYYY-MM-DD" of now, local time */
function clock(): { date: string; time: string } {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

/** the programme event happening right now (today, started, not yet ended — the next start counts as the end) */
export function currentEvent(events: CampEvent[]): CampEvent | null {
  const now = clock();
  const today = events.filter((e) => e.date === now.date).sort((a, b) => a.startTime.localeCompare(b.startTime));
  for (let k = 0; k < today.length; k++) {
    const e = today[k];
    const end = e.endTime ?? today[k + 1]?.startTime ?? "23:59";
    if (e.startTime <= now.time && now.time < end) return e;
  }
  return null;
}

/**
 * Default event for giving points: the one happening now; when nothing is
 * live (between events, late at night…), the last one that already
 * started; before the programme begins, the first one.
 */
export function defaultEvent(events: CampEvent[]): CampEvent | null {
  const live = currentEvent(events);
  if (live) return live;
  const now = clock();
  const sorted = events.slice().sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  const started = sorted.filter((e) => e.date < now.date || (e.date === now.date && e.startTime <= now.time));
  return started[started.length - 1] ?? sorted[0] ?? null;
}

/** short beep via WebAudio — no asset needed; silently skipped when the browser refuses */
function beep(kind: "ok" | "error") {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const notes = kind === "ok" ? [880, 1320] : [220, 160];
    const t0 = ctx.currentTime;
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = kind === "ok" ? "sine" : "square";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + i * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.25, t0 + i * 0.09 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.09 + 0.12);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + i * 0.09);
      osc.stop(t0 + i * 0.09 + 0.13);
    });
    setTimeout(() => void ctx.close(), 400);
  } catch {
    /* audio is a nicety */
  }
  if (kind === "error" && "vibrate" in navigator) navigator.vibrate?.(120);
}

/**
 * Bulk points at a door, tied to a programme EVENT: the camera stays on
 * while the dialog is open and every kid's QR code scanned gives the
 * event's points to the kid's team. The event (default: the one happening
 * now) is the unit of the round, shared across every device — a kid counts
 * once per event, and the points are one value per event: changing them
 * re-points everyone already scanned. Green flash + chime on success, red
 * flash + buzz with the reason on failure.
 */
export default function ScanPointsDialog({ token, onClose, initialEventId, initialPoints, onChange }: ScanPointsDialogProps) {
  const { tx, te } = useI18n();
  const events = useCollection("events");
  const campers = useCollectionOrEmpty("campers");
  const scores = useCollectionOrEmpty("scores");
  const sorted = useMemo(() => (events ?? []).slice().sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)), [events]);
  const current = useMemo(() => currentEvent(sorted), [sorted]);
  const initial = useMemo(() => defaultEvent(sorted), [sorted]);

  const [eventId, setEventId] = useState<string>(initialEventId || initial?.id || "");
  const [points, setPoints] = useState<number>(initialPoints && initialPoints >= 1 ? initialPoints : 1);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const [torch, setTorch] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [repointing, setRepointing] = useState(false);
  const [repointError, setRepointError] = useState<string | null>(null);

  const event = sorted.find((e) => e.id === eventId) ?? null;
  /** every scan already made for this event, on any device (newest first — the store is the truth) */
  const eventScans = useMemo(() => scores.filter((s) => s.eventId === eventId && s.camperId), [scores, eventId]);
  const scannedIds = useMemo(() => new Set(eventScans.map((s) => s.camperId as string)), [eventScans]);
  /** the value the event's scans currently carry (null: nobody scanned yet) */
  const eventPoints = eventScans[0]?.points ?? null;

  // default to the event happening now (or the last one started) once the programme arrives (the dialog may open before the first snapshot)
  const defaulted = useRef(!!initialEventId || !!initial);
  useEffect(() => {
    if (!defaulted.current && initial) {
      defaulted.current = true;
      setEventId((id) => id || initial.id);
    }
  }, [initial]);

  // switching events: adopt the points that event already uses
  useEffect(() => {
    setRepointError(null);
    if (eventPoints !== null) setPoints(eventPoints);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    if (!Number.isInteger(points) || points < 1) return;
    onChangeRef.current?.({ eventId, points });
  }, [eventId, points]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const busyRef = useRef(false);
  /** the last raw value + when: ignores the same code while it is still in front of the camera */
  const lastRef = useRef<{ raw: string; at: number }>({ raw: "", at: 0 });
  const stateRef = useRef({ eventId, points, campers, scannedIds });
  stateRef.current = { eventId, points, campers, scannedIds };
  const flashTimer = useRef<number | null>(null);
  const txRef = useRef(tx);
  txRef.current = tx;

  function showFlash(f: Flash) {
    setFlash(f);
    beep(f.kind);
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), f.kind === "ok" ? FLASH_MS : FLASH_MS + 800);
  }

  async function handleScan(raw: string) {
    const now = Date.now();
    if (busyRef.current) return;
    // same code lingering in front of the lens: ignore it until it has left the view for a few seconds
    if (raw === lastRef.current.raw && now - lastRef.current.at < 3000) {
      lastRef.current.at = now;
      return;
    }
    lastRef.current = { raw, at: now };
    busyRef.current = true;
    const { eventId, points, campers, scannedIds } = stateRef.current;
    const t = txRef.current;
    try {
      if (!eventId) throw new Error(t("Escolha o evento da programação antes de ler."));
      if (!Number.isInteger(points) || points < 1) throw new Error(t("Informe uma quantidade de pontos maior que zero."));
      const id = camperIdFromQr(raw);
      if (!id) throw new Error(t("Este QR code não é de uma pulseira ou crachá do Acampa Kids."));
      const known = campers.find((x) => x.id === id);
      if (scannedIds.has(id)) throw new Error(t("{name} já foi lido(a) neste evento.", { name: known?.name.split(" ")[0] || t("Esta criança") }));
      if (known && !known.team) throw new Error(t("{name} não está em nenhum time.", { name: known.name.split(" ")[0] || t("Esta criança") }));
      const res = await scanScore(token, { camperId: id, eventId, points });
      const checkin = res.checkedIn ? t(" · ✅ check-in feito") : "";
      showFlash({ kind: "ok", text: t("{name} · +{n} para {team}{checkin}", { name: (res.camperName || known?.name || "").split(" ")[0] || t("A criança"), n: points, team: res.team.name, checkin }), color: res.team.color });
    } catch (e) {
      showFlash({ kind: "error", text: te(e, "Não foi possível ler este QR code.") });
    } finally {
      busyRef.current = false;
    }
  }
  const handleScanRef = useRef(handleScan);
  handleScanRef.current = handleScan;

  // the camera runs for as long as the dialog is open
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let disposed = false;
    const scanner = new QrScanner(video, (result) => void handleScanRef.current(result.data), {
      preferredCamera: "environment",
      maxScansPerSecond: 8,
      calculateScanRegion: visibleScanRegion,
      highlightScanRegion: true,
      highlightCodeOutline: true,
      returnDetailedScanResult: true,
      onDecodeError: () => undefined,
    });
    scannerRef.current = scanner;
    const stopOverlay = keepOverlayInPlace(scanner, video);
    void scanner
      .start()
      .then(async () => {
        if (disposed) return;
        setStarting(false);
        setHasTorch(await scanner.hasFlash().catch(() => false));
      })
      .catch((err) => {
        if (disposed) return;
        setStarting(false);
        setCameraError(cameraErrorText(err, txRef.current));
      });
    return () => {
      disposed = true;
      stopOverlay();
      scanner.destroy();
      if (scannerRef.current === scanner) scannerRef.current = null;
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
    };
  }, []);

  async function toggleTorch() {
    const s = scannerRef.current;
    if (!s) return;
    try {
      await s.toggleFlash();
      setTorch(s.isFlashOn());
    } catch {
      setCameraError(tx("Não foi possível ligar a lanterna."));
    }
  }

  const pointsValid = Number.isInteger(points) && points >= 1 && points <= POINTS_MAX;
  /** the value differs from what the event's scans carry: offer to re-point them all */
  const pointsDiverge = pointsValid && eventPoints !== null && eventPoints !== points;

  async function applyRepoint() {
    if (!eventId || !pointsValid || repointing) return;
    setRepointing(true);
    setRepointError(null);
    try {
      await repointEventScans(token, eventId, points);
    } catch (e) {
      setRepointError(te(e, "Algo deu errado."));
    } finally {
      setRepointing(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title={tx("Lançar pontos em massa")} width={560} fullscreenOnMobile>
      <div className="qr-scanner scan-points">
        <header className="qr-scanner__head">
          <div>
            <h2 className="cat-form__title"><QrGlyph /> {tx("Pontos por QR code")}</h2>
            <p className="cat-hint">
              {tx("Cada crachá lido dá")} {pointsValid ? points : "—"} {points !== 1 ? tx("pontos") : tx("ponto")} {tx("ao time da criança.")}
            </p>
          </div>
          <button type="button" className="qr-scanner__close" aria-label={tx("Encerrar leitura")} title={tx("Encerrar")} onClick={onClose}>
            ✕
          </button>
        </header>

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
        {!eventId && sorted.length > 0 && <p className="cat-hint cat-hint--error">{tx("Escolha o evento: a leitura fica bloqueada até lá.")}</p>}
        {!pointsValid && <p className="message message--error">{tx("Os pontos precisam ser um número inteiro maior que zero.")}</p>}
        {pointsDiverge && (
          <p className="cat-hint cat-hint--error scan-points__repoint">
            ⚠️{" "}
            {eventScans.length === 1 ? tx("{n} criança já lida com", { n: eventScans.length }) : tx("{n} crianças já lidas com", { n: eventScans.length })}{" "}
            <strong>{eventPoints}</strong> {eventPoints === 1 ? tx("ponto") : tx("pontos")}. {tx("O valor é um só por evento: a próxima leitura (ou o botão) muda todas para")} <strong>{points}</strong>.{" "}
            <button type="button" className="button button--secondary scan-points__repoint-btn" disabled={repointing} onClick={() => void applyRepoint()}>
              {repointing ? tx("Atualizando…") : tx("Atualizar todas para {n}", { n: points })}
            </button>
          </p>
        )}
        {repointError && <p className="message message--error">{repointError}</p>}

        <div className={`qr-scanner__viewport scan-points__viewport ${flash ? `scan-points__viewport--${flash.kind}` : ""}`}>
          <video ref={videoRef} className="qr-scanner__video" playsInline muted />
          {starting && !cameraError && (
            <div className="qr-scanner__status" role="status">
              <span className="qr-scanner__spinner" aria-hidden="true" />
              {tx("Abrindo câmera…")}
            </div>
          )}
          {flash && (
            <div className={`scan-points__flash scan-points__flash--${flash.kind}`} role="status" aria-live="assertive">
              <span className="scan-points__flash-icon" aria-hidden="true">
                {flash.kind === "ok" ? "✅" : "⛔"}
              </span>
              <span className="scan-points__flash-text">{flash.text}</span>
            </div>
          )}
        </div>

        {cameraError && <p className="message message--error">{cameraError}</p>}

        {event && (
          <p className="scan-points__summary" aria-live="polite">
            <strong>{eventScans.length}</strong>{" "}
            {eventScans.length === 1 ? tx("criança ganhou pontos neste evento") : tx("crianças ganharam pontos neste evento")}
          </p>
        )}

        <div className="qr-scanner__actions">
          {hasTorch && (
            <button type="button" className="button button--secondary" aria-pressed={torch} onClick={toggleTorch}>
              {torch ? tx("🔦 Desligar lanterna") : tx("🔦 Ligar lanterna")}
            </button>
          )}
          <button type="button" className="button button--primary" onClick={onClose}>
            {tx("Encerrar leitura")}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function cameraErrorText(err: unknown, tx: (pt: string, vars?: Record<string, string | number>) => string): string {
  const name = typeof err === "object" && err && "name" in err ? String((err as { name: unknown }).name) : "";
  if (name === "NotAllowedError") return tx("Permita o acesso à câmera nas configurações do navegador e tente novamente.");
  if (name === "NotFoundError") return tx("Nenhuma câmera foi encontrada neste aparelho.");
  if (name === "NotReadableError") return tx("A câmera está sendo usada por outro aplicativo.");
  if (!window.isSecureContext) return tx("A câmera só funciona em uma conexão segura (HTTPS).");
  return tx("Não foi possível abrir a câmera. Confira a permissão e tente novamente.");
}
