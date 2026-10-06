import { useEffect, useMemo, useState } from "react";
import { getSelfCheckinStatus, selfCheckin, type SelfCheckinStatus } from "../api/staff";
import { ApiError } from "../api/client";
import { distanceMeters, GeoError, formatDistance, readPosition, type DevicePosition } from "../geo";
import type { LoggedUser } from "../roles";
import { speakTime } from "../dates";
import { useCollection, useCollectionOrEmpty } from "../store";
import { useI18n } from "../i18n";
import { usePersonName } from "../store/people";
import Dialog from "./Dialog";

interface SelfCheckinCardProps {
  token: string;
  /** the logged-in person — their staff record is the one whose id is their person id */
  user: LoggedUser;
}

/** "YYYY-MM-DD" of today in the device's clock */
function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** the check-in window opens this long before the first event (mirrors the server) */
const OPENS_MINUTES_BEFORE = 60;

/** "YYYY-MM-DD" + "HH:mm" in the device's clock → epoch ms */
function localDateTime(date: string, time: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  return new Date(y, m - 1, d, h, min).getTime();
}

/** popup dismissed for this browser session only — it pops again next time the app is opened */
const DISMISS_KEY = "acampa.selfcheck.dismissed";
function isDismissed(date: string): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === date;
  } catch {
    return false;
  }
}
function remember(date: string) {
  try {
    sessionStorage.setItem(DISMISS_KEY, date);
  } catch {
    /* private mode: just don't persist */
  }
}

/**
 * "Cheguei na igreja!" — lets a team member mark their own arrival on the
 * departure day (the day of the first event of the programme). The phone
 * sends its GPS position and the SERVER decides whether it is close enough to
 * the spot the admin configured (Configurações → Local do check-in).
 *
 * The window opens ONE HOUR before the first event and lasts the rest of the
 * departure day (the server enforces the same rule). Until then, and every
 * other day, it renders nothing. When the window opens it first shows as a
 * POPUP; once dismissed (✕, Esc or tapping outside) the very same
 * card stays INLINE on the home page, in its usual place, so the person can
 * still check in later. Once checked in, the green "done" card shows inline.
 */
export default function SelfCheckinCard({ token, user }: SelfCheckinCardProps) {
  const { tx, te } = useI18n();
  const staff = useCollection("staff");
  const events = useCollectionOrEmpty("events");
  const settings = useCollection("settings");
  const me = useMemo(() => staff?.find((s) => s.id === user.personId) ?? null, [staff, user.personId]);
  /** who stamped the arrival when it was not the person themself (name read live) */
  const stampedBy = usePersonName(me?.checkin && me.checkin.byPersonId !== user.personId ? me.checkin.byPersonId : null);
  /** first event of the programme = departure (events come sorted by date/time, but sort defensively) */
  const first = useMemo(() => [...events].sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))[0] ?? null, [events]);
  const departure = first?.date ?? null;
  /** epoch ms from which the window is open (device clock) */
  const opensAt = first ? localDateTime(first.date, first.startTime) - OPENS_MINUTES_BEFORE * 60_000 : null;

  // tick once when the window opens, so the card shows up without a reload
  const [, tick] = useState(0);
  useEffect(() => {
    if (opensAt === null) return;
    const wait = opensAt - Date.now();
    if (wait <= 0) return;
    const t = setTimeout(() => tick((n) => n + 1), Math.min(wait, 2 ** 31 - 1));
    return () => clearTimeout(t);
  }, [opensAt]);

  const [status, setStatus] = useState<SelfCheckinStatus | null>(null);
  const [pos, setPos] = useState<DevicePosition | null>(null);
  const [phase, setPhase] = useState<"idle" | "locating" | "sending">("idle");
  const [error, setError] = useState<string | null>(null);
  const [justDone, setJustDone] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const isDepartureDay = !!departure && departure === today();
  /** departure day AND at most one hour before the first event */
  const isOpen = isDepartureDay && opensAt !== null && Date.now() >= opensAt;
  const checkedIn = !!me?.checkin;

  // remember a dismissal from earlier in this session
  useEffect(() => {
    if (departure && isDismissed(departure)) setDismissed(true);
  }, [departure]);

  // ask the server whether the window is open (it also brings the target spot for the distance hint)
  useEffect(() => {
    if (!isOpen || checkedIn) return;
    let alive = true;
    getSelfCheckinStatus(token)
      .then((s) => alive && setStatus(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [token, isOpen, checkedIn]);

  if (!me || !departure) return null;
  if (!isOpen && !checkedIn) return null;

  const busy = phase !== "idle";
  /** popup while not dismissed; if the person was already checked in when we got here, no popup at all */
  const popup = isOpen && !dismissed && (!checkedIn || justDone !== null);

  function dismiss() {
    if (busy) return;
    setDismissed(true);
    remember(departure!);
  }

  async function handleCheckin() {
    if (busy) return;
    setError(null);
    setPhase("locating");
    let p: DevicePosition;
    try {
      p = await readPosition();
      setPos(p);
    } catch (err) {
      // GeoError already speaks the device language (geo.ts); anything else goes through the error texts
      setError(err instanceof GeoError ? err.message : te(err));
      setPhase("idle");
      return;
    }
    setPhase("sending");
    try {
      const res = await selfCheckin(token, { lat: p.lat, lng: p.lng, accuracyM: p.accuracyM });
      setJustDone(res.distanceM);
    } catch (err) {
      if (err instanceof ApiError && err.code === "ALREADY_CHECKED_IN") {
        // someone from the admin table beat us to it — the store update will flip the card
        setError(null);
      } else {
        setError(te(err, "Algo deu errado."));
      }
    } finally {
      setPhase("idle");
    }
  }

  // ── already there ──
  if (checkedIn) {
    const when = speakTime(me.checkin!.at);
    const self = me.checkin!.byPersonId === user.personId;
    const distanceNote = justDone !== null && justDone > 0 ? tx(" (a {distance} do ponto de encontro)", { distance: formatDistance(justDone) }) : "";
    const arrival = self
      ? tx("Você confirmou sua chegada às {when}", { when })
      : tx("{name} confirmou sua chegada às {when}", { name: stampedBy.split(" ")[0] || tx("A equipe"), when });
    const card = (
      <section className={`selfcheck selfcheck--done${popup ? " selfcheck--popup" : ""}`} aria-live="polite">
        <span className="selfcheck__badge" aria-hidden="true">✅</span>
        <div className="selfcheck__body">
          <h2 className="selfcheck__title">{tx("Check-in feito!")}</h2>
          <p className="selfcheck__text">
            {arrival}{distanceNote}. {tx("Boa viagem! 🚌")}
          </p>
          {popup && (
            <button type="button" className="button button--primary selfcheck__cta" onClick={dismiss}>
              {tx("Fechar 🎉")}
            </button>
          )}
        </div>
      </section>
    );
    return popup ? (
      <Dialog open onClose={dismiss} title={tx("Check-in feito!")} width={520}>
        {card}
      </Dialog>
    ) : (
      card
    );
  }

  /** the nearest meeting point (the church, the camp site…) and how far it is */
  const nearest =
    pos && status && status.locations.length > 0
      ? status.locations.map((l) => ({ spot: l, distance: distanceMeters(pos, l) })).sort((a, b) => a.distance - b.distance)[0]
      : null;
  const distance = nearest?.distance ?? null;
  const blocked = status && !status.allowed ? status.reason : null;
  /**
   * Which spot to name on the button: inside the admin's check-in window
   * (the church roll call is happening) it is the FIRST spot — the church;
   * after it closes (whoever drives straight to the camp) it is the nearest
   * one the GPS found, or the last spot as a hint before the GPS is read.
   */
  const spots = status?.locations ?? [];
  const windowOpen = !!settings?.checkinWindow.open;
  const target = spots.length === 0 ? null : windowOpen ? spots[0] : (nearest?.spot ?? spots[spots.length - 1]);
  const spotName = target?.name ?? tx("igreja");
  const placeLabel = spots.length > 1 && !windowOpen ? spots.map((l) => l.name).join(` ${tx("ou")} `) : spotName;
  const accuracy = pos && pos.accuracyM > 0 ? tx(" (precisão do GPS: ±{m} m)", { m: pos.accuracyM }) : "";

  const card = (
    <section className={`selfcheck${popup ? " selfcheck--popup" : ""}`} aria-live="polite">
      {popup && (
        <button type="button" className="selfcheck__close" aria-label={tx("Fechar")} disabled={busy} onClick={dismiss}>
          ✕
        </button>
      )}
      <span className="selfcheck__badge" aria-hidden="true">⛪</span>
      <div className="selfcheck__body">
        <h2 className="selfcheck__title">{tx("O acampamento é Hoje!!!")}</h2>
        <p className="selfcheck__text">
          {tx("Ao chegar em {place}, confirme sua presença aqui", { place: placeLabel })}
        </p>

        {blocked && <p className="message message--error">{te(blocked)}</p>}
        {error && <p className="message message--error">{error}</p>}
        {distance !== null && !error && (
          <p className="cat-hint">
            {tx("📡 Você está a cerca de {distance} de {place}{accuracy}.", { distance: formatDistance(distance), place: nearest!.spot.name, accuracy })}
          </p>
        )}

        <div className="selfcheck__actions">
          <button type="button" className="button button--primary selfcheck__cta" disabled={busy || !!blocked} onClick={handleCheckin}>
            {phase === "locating" ? tx("📡 Lendo o GPS…") : phase === "sending" ? tx("Confirmando…") : tx("Cheguei em {place}! ✋", { place: spotName })}
          </button>
        </div>
        <p className="selfcheck__location-note">{tx("Precisamos da sua localização para saber que você já chegou.")}</p>
      </div>
    </section>
  );

  return popup ? (
    <Dialog open onClose={dismiss} title={tx("O acampamento é Hoje!!!")} width={520}>
      {card}
    </Dialog>
  ) : (
    card
  );
}
