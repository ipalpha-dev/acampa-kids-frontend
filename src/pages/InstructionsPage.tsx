import { useMemo, type ReactNode } from "react";
import { speakDay } from "../dates";
import Breadcrumbs from "../components/Breadcrumbs";
import RichHtml from "../components/RichHtml";
import type { LoggedUser } from "../roles";
import { useRoute } from "../router";
import { useCollection, useCollectionOrEmpty } from "../store";
import { useMyPrepRoles } from "../store/derive";
import { ICONS } from "../icons";
import { staffSex } from "../api/staff";
import { useI18n } from "../i18n";

interface InstructionsPageProps {
  user: LoggedUser;
  /** phones: Preparação and Instruções share one bottom-bar entry — this jumps to the other half */
  pairedWith?: () => void;
}

/** one row of the list — a role's instructions or a general document */
interface Doc {
  /** route segment(s) after /instructions */
  path: string;
  emoji: string;
  title: string;
  /** extra bits next to the title (assignment details of a role) */
  extra?: ReactNode;
  html: string;
  role?: boolean;
  /** the next (or most recent) event for this role */
  event?: { title: string; emoji: string; date: string; startTime: string; endTime: string | null; now: boolean };
  /** every moment of this role already ended */
  past?: boolean;
}

/** local date/time of now, comparable with the events' "YYYY-MM-DD" / "HH:mm" */
function clock(): { date: string; time: string } {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

const shortDate = (iso: string) => speakDay(iso, "weekday");

function eventIsNow(e: { date: string; startTime: string; endTime: string | null }, now: { date: string; time: string }): boolean {
  return e.date === now.date && e.startTime <= now.time && now.time < (e.endTime ?? "23:59");
}

/**
 * Instruções — everything a team member must know, read-only:
 *   1. the instructions of every função the person is linked to (explicit
 *      assignment in an event, or a "for everyone" default) — written by
 *      the admin in the role itself;
 *   2. the general documents of the camp (⚙️ → Instruções).
 * A list of titles; tapping one opens the whole document. Works offline.
 *
 *   /instructions                 list
 *   /instructions/:id             one general document
 *   /instructions/role/:roleId    the instructions of one of my roles
 */
export default function InstructionsPage({ user, pairedWith }: InstructionsPageProps) {
  const { tx } = useI18n();
  const docs = useCollection("instructions");
  const events = useCollection("events");
  const staff = useCollectionOrEmpty("staff");
  const bedrooms = useCollectionOrEmpty("bedrooms");
  const myRoles = useMyPrepRoles(user.personId);
  const { segments, navigate } = useRoute();
  const me = useMemo(() => staff.find((s) => s.id === user.personId), [staff, user.personId]);
  const myFaceSrc = me
    ? me.roomRole === "caretaker"
      ? staffSex(me, bedrooms) === "M"
        ? ICONS.leaderFace
        : ICONS.leaderFaceWoman
      : staffSex(me, bedrooms) === "M"
        ? ICONS.helperFace
        : ICONS.helperFaceWoman
    : ICONS.helperFaceWoman;

  if (!docs || myRoles === null) {
    return (
      <div className="admin-page">
        <p className="opt-empty">{tx("Sincronizando com o servidor… 🏕️")}</p>
      </div>
    );
  }

  const now = clock();
  const ended = (e: { date: string; startTime: string; endTime: string | null }) => e.date < now.date || (e.date === now.date && (e.endTime ?? e.startTime) < now.time);
  /** only the roles that actually have instructions — the others would just be noise here */
  const roleDocs: Doc[] = myRoles
    .filter((m) => m.role.instructions)
    .map((m) => {
      // events come in programme order → the first one not yet ended is the next
      const next = m.events.find((e) => !ended(e));
      const ref = next ?? m.events[m.events.length - 1];
      return {
        path: `role/${m.role.id}`,
        emoji: m.role.emoji,
        title: m.role.name,
        extra: m.details.map((d) => (
          <span key={d} className="staff-tag__n">{d}</span>
        )),
        html: m.role.instructions,
        role: true,
        event: ref ? { ...ref, now: eventIsNow(ref, now) } : undefined,
        past: m.events.length > 0 && !next,
      };
    });
  const generalDocs: Doc[] = docs.map((d) => ({ path: d.id, emoji: d.emoji, title: d.title, html: d.content }));
  // the camp has started once the first event of the programme is under way
  const firstDate = events?.reduce<string | null>((min, e) => (min === null || e.date < min ? e.date : min), null) ?? null;
  const camping = firstDate !== null && firstDate <= now.date;
  const upcoming = roleDocs.filter((d) => !d.past);
  const done = roleDocs.filter((d) => d.past);
  // during the camp the roles come first; before it, the general documents. What already happened is always last.
  const allDocs = camping ? [...upcoming, ...generalDocs, ...done] : [...generalDocs, ...upcoming, ...done];

  // ── one document ────────────────────────────────────────────────────────
  const path = segments.slice(1).join("/");
  if (path) {
    const d = allDocs.find((x) => x.path === path);
    return (
      <div className="admin-page admin-page--wide">
        <Breadcrumbs items={[{ label: tx("Instruções"), onClick: () => navigate("/instructions") }, { label: d?.title ?? tx("Documento") }]} />
        {!d ? (
          <p className="opt-empty">{tx("Documento não encontrado.")}</p>
        ) : (
          <div className="instruction-reader">
            <aside className="instruction-sidebar">
              <h2 className="instruction-sidebar__title">{tx("Instruções")}</h2>
              <nav aria-label={tx("Instruções")}>
                <ul className="instruction-sidebar__list">
                  {allDocs.map((item) => {
                    const selected = item.path === path;
                    return (
                      <li key={item.path}>
                        <button
                          type="button"
                          className={`instruction-sidebar__link${selected ? " instruction-sidebar__link--selected" : ""}${item.past ? " instruction-sidebar__link--past" : ""}`}
                          title={item.title}
                          aria-current={selected ? "page" : undefined}
                          onClick={() => navigate(`/instructions/${item.path}`)}
                        >
                          <span aria-hidden="true">{item.emoji}</span>
                          <span className="instruction-sidebar__text">
                            <span className="instruction-sidebar__label">{item.title}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </nav>
            </aside>
            <article className="detail-card instruction-doc">
              <h1 className="admin-title instruction-doc__title">
                <span aria-hidden="true">{d.emoji}</span> {d.title}
                {d.extra}
                {d.role && <span className="prep-section__tag instruction-doc__role">{tx("sua função")}</span>}
              </h1>
              {d.event && (
                <div className={`instruction-event${d.event.now ? " instruction-event--now" : ""}`}>
                  {d.event.now && <span className="instruction-event__now">{tx("agora")}</span>}
                  <strong>{d.event.emoji} {d.event.title}</strong>
                  <span>{speakDay(d.event.date)} · {d.event.startTime}{d.event.endTime ? `–${d.event.endTime}` : ""}</span>
                </div>
              )}
              {d.html ? <RichHtml html={d.html} /> : <p className="opt-empty">{tx("Este documento ainda está vazio.")}</p>}
            </article>
          </div>
        )}
      </div>
    );
  }

  // ── list ────────────────────────────────────────────────────────────────
  const open = (d: Doc) => navigate(`/instructions/${d.path}`);
  const renderList = (items: Doc[]) => (
    <ul className="staff-list">
      {items.map((d) => (
        <li key={d.path} className={`staff-card staff-card--clickable instruction-row${d.past ? " instruction-row--past" : ""}`}>
          <div
            className="staff-card__body"
            role="button"
            tabIndex={0}
            onClick={() => open(d)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                open(d);
              }
            }}
          >
            <h3 className="staff-card__name">
              <span aria-hidden="true">{d.emoji}</span> {d.title}
              {d.extra}
            </h3>
          </div>
          <span className="instruction-row__chevron" aria-hidden="true">›</span>
        </li>
      ))}
    </ul>
  );

  const empty = roleDocs.length === 0 && generalDocs.length === 0;
  const roleSection = { key: "roles", title: <><img className="audience-icon" src={myFaceSrc} alt="" aria-hidden="true" /> {tx("Suas funções")}</>, items: [...upcoming, ...done] };
  const generalSection = { key: "general", title: `🏕️ ${tx("Geral")}`, items: generalDocs };
  const sections = (camping ? [roleSection, generalSection] : [generalSection, roleSection]).filter((s) => s.items.length > 0);

  return (
    <div className="admin-page">
      <header className="admin-head">
        <h1 className="admin-title">📖 {tx("Instruções")}</h1>
        {/* only while the bottom bar merges the pair (phones): the way to the other half */}
        {pairedWith && (
          <button type="button" className="dash-pair-link" onClick={pairedWith} title={tx("Ver a Preparação")}>
            <img className="dash-pair-link__icon" src={ICONS.preparation} alt="" aria-hidden="true" /> {tx("Preparação")}
          </button>
        )}
      </header>

      {empty ? (
        <p className="opt-empty">{tx("A organização ainda não publicou instruções. 📖")}</p>
      ) : (
        <>
          {sections.map((s) => (
            <section key={s.key} className="day-group instruction-group">
              {sections.length > 1 && (
                <header className="room-group__head">
                  <h2 className="room-group__title room-group__title--green">{s.title}</h2>
                  <span className="room-group__stats">{s.items.length}</span>
                </header>
              )}
              {renderList(s.items)}
            </section>
          ))}
        </>
      )}
    </div>
  );
}
