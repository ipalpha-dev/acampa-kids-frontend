import { useMemo, useState } from "react";
import { type BedroomGroup } from "../api/bedrooms";
import Breadcrumbs, { type Crumb } from "../components/Breadcrumbs";
import GiveawayDrawDialog from "../components/GiveawayDrawDialog";
import GroupIcon from "../components/GroupIcon";
import StaffIcon from "../components/StaffIcon";
import { ICONS } from "../icons";
import { useCollection } from "../store";
import { collatorLocale, useI18n } from "../i18n";

type Who = "campers" | "staff";

/** Uniform integer in [0, n) from the OS entropy source, with rejection sampling so no number is favoured. */
function drawIndex(n: number): number {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / n) * n; // largest multiple of n that fits in 32 bits
  let x: number;
  do {
    crypto.getRandomValues(buf);
    x = buf[0];
  } while (x >= limit);
  return x % n;
}

interface Row {
  id: string;
  name: string;
  /** just the room name ("209") — the wing is shown as an icon beside it */
  room: string;
  group: BedroomGroup | null;
  /** kids only: first name of the líder responsible for the child */
  leader?: string;
}

interface GiveawayPageProps {
  /** which list: opened from Acampantes → kids, from Equipe → team */
  who: Who;
  crumbs: Crumb[];
}

/**
 * Sorteio: a numbered list of everyone who is actually at the camp, so the
 * admin can draw a number and read who won. Kids: every camper checked in at
 * the church. Team: every ACTIVE member who checked in. Not a tab: it lives
 * inside Acampantes (/campers/giveaway) and Equipe (/staff/giveaway).
 */
export default function GiveawayPage({ who, crumbs }: GiveawayPageProps) {
  const { tx } = useI18n();
  const campers = useCollection("campers");
  const staff = useCollection("staff");
  const bedrooms = useCollection("bedrooms");

  const roomOf = useMemo(() => {
    const byId = new Map((bedrooms ?? []).map((b) => [b.id, b]));
    return (id: string | null) => {
      const b = id ? byId.get(id) : null;
      return { room: b ? b.name : "—", group: b ? b.group : null };
    };
  }, [bedrooms]);

  const rows = useMemo<Row[]>(() => {
    const collator = new Intl.Collator(collatorLocale(), { sensitivity: "base" });
    const staffById = new Map((staff ?? []).map((s) => [s.id, s]));
    if (who === "campers") {
      return (campers ?? [])
        .filter((c) => !!c.checkin)
        .sort((a, b) => collator.compare(a.name, b.name))
        .map((c) => ({ id: c.id, name: c.name, ...roomOf(c.bedroom), leader: staffById.get(c.caretakerId ?? "")?.name.split(" ")[0] }));
    }
    return (staff ?? [])
      .filter((s) => s.active && !!s.checkin)
      .sort((a, b) => collator.compare(a.name, b.name))
      .map((s) => ({ id: s.id, name: s.name, ...roomOf(s.bedroom) }));
  }, [who, campers, staff, roomOf]);

  const synced = who === "campers" ? campers !== null : staff !== null;

  /** index into `rows` of the current winner; null = dialog closed */
  const [winner, setWinner] = useState<number | null>(null);
  /** bumps on every draw so a repeated number still rolls again */
  const [round, setRound] = useState(0);
  const draw = () => {
    setWinner(drawIndex(rows.length));
    setRound((r) => r + 1);
  };

  return (
    <div className="admin-page">
      <Breadcrumbs items={crumbs} />
      <header className="admin-head">
        <h1 className="admin-title">
          <img className="admin-title__icon" src={ICONS.giveaway} alt="" aria-hidden="true" /> {tx("Sorteio")} · {who === "campers" ? tx("Acampantes") : tx("Equipe")}
        </h1>
        <div className="admin-head__actions">
          <button type="button" className="button button--primary admin-head__new" disabled={rows.length === 0} title={tx("Sortear um número")} onClick={draw}>
            <img className="admin-head__action-icon" src={ICONS.draw} alt="" aria-hidden="true" /> {tx("Sortear")}
          </button>
        </div>
      </header>
      {winner !== null && <GiveawayDrawDialog key={round} open entries={rows} winner={winner} onRedraw={draw} onClose={() => setWinner(null)} />}
      <p className="admin-intro">
        {who === "staff"
          ? tx("Sorteie um número de 1 a {n} e veja quem ganhou. Só entram na lista quem fez check-in (e está ativo na equipe).", { n: rows.length || "…" })
          : tx("Sorteie um número de 1 a {n} e veja quem ganhou. Só entram na lista quem fez check-in.", { n: rows.length || "…" })}
      </p>

      {!synced && <p className="opt-empty">{tx("Sincronizando com o servidor… 🏕️")}</p>}
      {synced && rows.length === 0 && <p className="opt-empty">{tx("Ninguém fez check-in ainda.")}</p>}

      {rows.length > 0 && (
        <ol className="opt-items" aria-label={who === "campers" ? tx("Acampantes com check-in") : tx("Equipe com check-in")}>
          {rows.map((r, i) => (
            <li key={r.id} className="opt-item">
              <span className="opt-item__num">{i + 1}</span>
              <span className="opt-item__label">{r.name || "…"}</span>
              {r.leader && (
                <span className="opt-item__badge opt-item__badge--icon" title={tx("Líder da criança")}>
                  <StaffIcon size={16} /> {r.leader}
                </span>
              )}
              <span className="opt-item__badge opt-item__badge--icon">
                {r.group ? <GroupIcon group={r.group} face size={16} /> : null} {r.room}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
