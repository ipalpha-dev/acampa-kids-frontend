import { useEffect, useMemo, useState } from "react";
import Dialog from "./Dialog";
import GroupIcon from "./GroupIcon";
import { ICONS } from "../icons";
import { useI18n } from "../i18n";
import styles from "../styles/ops.module.scss";
import type { BedroomGroup } from "../api/bedrooms";

export interface DrawEntry {
  id: string;
  name: string;
  /** room name only ("209") — the wing comes from `group` as an icon */
  room: string;
  group?: BedroomGroup | null;
}

interface GiveawayDrawDialogProps {
  open: boolean;
  onClose: () => void;
  /** the numbered list on screen — index + 1 is the person's number */
  entries: DrawEntry[];
  /** draw again from the same list */
  onRedraw: () => void;
  /** the winning index (already picked by the parent, so a re-render does not re-roll) */
  winner: number;
}

const COLORS = ["#e7a44e", "#d84a3a", "#2e6652", "#8fc1e3", "#f4d35e", "#e98973", "#a9c2a0"];
/** keep in sync with `.reel` in styles/ops.module.scss (the reel's transition) */
const ROLL_MS = 1100;
/** how many numbers scroll past before landing (≈ 3 loops of a 40-entry list) */
const REEL_STEPS = 120;

/**
 * "Sortear": the number rolls like a lottery drum for ~1 s, then lands on the
 * winner with confetti raining over the whole screen. Re-roll from inside.
 */
export default function GiveawayDrawDialog({ open, onClose, entries, onRedraw, winner }: GiveawayDrawDialogProps) {
  const { tx } = useI18n();
  const [rolling, setRolling] = useState(true);
  /** the reel starts at the top (0) and scrolls to the last cell */
  const [spun, setSpun] = useState(false);

  /** a strip of numbers ending on the winner: 1..n repeated, so it looks like the list is going round */
  const reel = useMemo(() => {
    const n = Math.max(entries.length, 1);
    const cells: number[] = [];
    for (let i = REEL_STEPS; i >= 0; i--) cells.push(((winner - i) % n + n) % n + 1);
    return cells;
  }, [entries.length, winner]);

  // kick the reel on the next frame (so the transition runs), then settle
  useEffect(() => {
    if (!open) return;
    setRolling(true);
    setSpun(false);
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setSpun(true)));
    const done = window.setTimeout(() => setRolling(false), ROLL_MS + 80);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(done);
    };
  }, [open, winner]);

  // confetti pieces: fixed per open so they don't re-shuffle every render
  const confetti = useMemo(
    () =>
      Array.from({ length: 90 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 1.2,
        dur: 2.6 + Math.random() * 2,
        size: 7 + Math.random() * 8,
        color: COLORS[i % COLORS.length],
        spin: Math.random() > 0.5 ? 1 : -1,
        round: Math.random() > 0.6,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, winner],
  );

  const person = entries[winner];

  return (
    <Dialog open={open} onClose={onClose} title={tx("Resultado do sorteio")} width={520}>
      {!rolling && (
        <div className="draw-confetti" aria-hidden="true">
          {confetti.map((c, i) => (
            <i
              key={i}
              style={{
                left: `${c.left}%`,
                animationDelay: `${c.delay}s`,
                animationDuration: `${c.dur}s`,
                width: c.size,
                height: c.round ? c.size : c.size * 1.6,
                background: c.color,
                ["--spin" as string]: c.spin,
              }}
              className={c.round ? styles.confettiRound : styles.confettiStrip}
            />
          ))}
        </div>
      )}
      <div className={`draw ${rolling ? "draw--rolling" : "draw--done"}`}>
        <img className="draw__icon" src={rolling ? ICONS.giveaway : ICONS.draw} alt="" aria-hidden="true" />
        <p className="draw__label">{rolling ? tx("Sorteando…") : tx("🎉 E o número sorteado é…")}</p>
        <div className="draw__number" aria-live="polite" aria-label={rolling ? tx("Sorteando") : String(winner + 1)}>
          <div
            className={`draw__reel ${styles.reel} ${spun ? "draw__reel--spun" : ""}`}
            style={{ transform: `translateY(${spun ? -(reel.length - 1) * 1.2 : 0}em)` }}
          >
            {reel.map((n, i) => (
              <span key={i} className="draw__cell" aria-hidden={i !== reel.length - 1}>{n}</span>
            ))}
          </div>
        </div>
        <div className="draw__winner" aria-live="assertive">
          {!rolling && person && (
            <>
              <strong className="draw__name">{person.name || "…"}</strong>
              <span className="draw__room">
                {person.group ? <GroupIcon group={person.group} face size={18} /> : null} {person.room}
              </span>
            </>
          )}
        </div>
        <div className="draw__actions">
          <button type="button" className="button button--secondary" disabled={rolling} onClick={onRedraw}>
            <img className="admin-head__action-icon" src={ICONS.draw} alt="" aria-hidden="true" /> {tx("Sortear de novo")}
          </button>
          <button type="button" className="button button--primary" onClick={onClose}>
            {tx("Fechar")}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
