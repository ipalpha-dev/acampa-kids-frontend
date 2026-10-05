import { useEffect, useMemo, useState } from "react";
import { autoAudienceLabel, autoRoleFor, roleDetailOf, type CampEvent, type ScheduleRole } from "../api/schedule";
import { speakDay } from "../dates";
import InstructionsDialog from "../components/InstructionsDialog";
import type { LoggedUser } from "../roles";
import { useRoute } from "../router";
import { useCollection, useCollectionOrEmpty } from "../store";
import { useCampTiming } from "../campPhase";
import { ICONS } from "../icons";
import { staffSex } from "../api/staff";
import { collatorLocale, useI18n } from "../i18n";

interface MySchedulePageProps {
  user: LoggedUser;
}

type Filter = "mine" | "all";

interface MyEvent {
  event: CampEvent;
  role: ScheduleRole | null;
  detail: string;
  implicit: boolean;
}

function clock(): { date: string; time: string } {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

export default function MySchedulePage({ user }: MySchedulePageProps) {
  const { tx } = useI18n();
  const storedEvents = useCollection("events");
  const roles = useCollectionOrEmpty("roles");
  const staff = useCollectionOrEmpty("staff");
  const bedrooms = useCollectionOrEmpty("bedrooms");
  const teams = useCollectionOrEmpty("teams");
  const { params, navigate } = useRoute();
  const [instructionsFor, setInstructionsFor] = useState<MyEvent | null>(null);
  const [showPast, setShowPast] = useState(false);
  const first = user.name.split(" ")[0];
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

  const items = useMemo<MyEvent[] | null>(() => {
    if (!storedEvents) return null;
    const roleById = new Map(roles.map((r) => [r.id, r]));
    const myTeam = me?.team ? teams.find((t) => t.id === me.team) : null;
    return storedEvents
      .map((e): MyEvent => {
        const mine = e.assignments[0];
        const role = mine ? (roleById.get(mine.roleId) ?? null) : (me ? (autoRoleFor(e.roles, me.roomRole, roleById) ?? null) : null);
        return { event: e, role, detail: roleDetailOf(role, mine, myTeam).detail, implicit: !mine && !!role };
      })
      .sort((a, b) => a.event.date.localeCompare(b.event.date) || a.event.startTime.localeCompare(b.event.startTime) || a.event.title.localeCompare(b.event.title, collatorLocale()));
  }, [storedEvents, roles, teams, me]);

  const [now, setNow] = useState(clock);
  useEffect(() => {
    const t = setInterval(() => setNow(clock()), 60_000);
    return () => clearInterval(t);
  }, []);

  const { during: campOn } = useCampTiming();
  const chosen = params.get("all");
  const filter: Filter = chosen === "1" ? "all" : chosen === "0" ? "mine" : campOn ? "all" : "mine";
  const setFilter = (f: Filter) => navigate("/schedule", { query: { all: f === "all" ? "1" : "0" }, replace: true });

  if (!items) {
    return (
      <div className="admin-page">
        <p className="opt-empty">{tx("Sincronizando com o servidor… 🏕️")}</p>
      </div>
    );
  }

  const mine = items.filter((i) => i.role);
  const visible = filter === "all" ? items : mine;
  const current = (() => {
    const today = items.filter((i) => i.event.date === now.date);
    for (let k = 0; k < today.length; k++) {
      const e = today[k].event;
      const end = e.endTime ?? today[k + 1]?.event.startTime ?? "23:59";
      if (e.startTime <= now.time && now.time < end) return e.id;
    }
    return null;
  })();
  const isPast = (e: CampEvent) => e.id !== current && (e.date < now.date || (e.date === now.date && (e.endTime ?? e.startTime) < now.time));
  const pastCount = visible.filter((i) => isPast(i.event)).length;
  const collapsePast = pastCount > 0 && pastCount < visible.length && !showPast;
  const shown = collapsePast ? visible.filter((i) => !isPast(i.event)) : visible;
  const days = [...new Set(shown.map((i) => i.event.date))];

  return (
    <div className="admin-page">
      <header className="admin-head">
        <h1 className="admin-title">
          <img className="admin-title__icon" src={ICONS.schedule} alt="" aria-hidden="true" /> {tx("Programação")}
        </h1>
      </header>
      <p className="admin-intro">
        {filter === "mine"
          ? mine.length > 0
            ? tx("Olá, {name}! Aqui está a sua escala — o que você faz em cada momento do acampamento.", { name: first })
            : tx("Olá, {name}! Você ainda não tem nada na escala.", { name: first })
          : tx("Toda a programação do acampamento. Onde tem algo para você fazer, aparece a sua função.")}
      </p>

      <div className="staff-toolbar__filters" role="tablist" aria-label={tx("Filtro da programação")}>
        <button type="button" role="tab" aria-selected={filter === "mine"} className={`cat-tab ${filter === "mine" ? "cat-tab--active" : ""}`} onClick={() => setFilter("mine")}>
          <img className="cat-tab__img" src={myFaceSrc} alt="" aria-hidden="true" /> {tx("Minha escala")}
          <span className="cat-tab__count">{mine.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={filter === "all"} className={`cat-tab ${filter === "all" ? "cat-tab--active" : ""}`} onClick={() => setFilter("all")}>
          <img className="cat-tab__img" src={ICONS.schedule} alt="" aria-hidden="true" /> {tx("Tudo")}
          <span className="cat-tab__count">{items.length}</span>
        </button>
      </div>

      {shown.length === 0 && (
        <div className="admin-empty">
          {filter === "mine" ? (
            <img className="admin-empty__icon" src={myFaceSrc} alt="" aria-hidden="true" />
          ) : (
            <img className="admin-empty__icon" src={ICONS.schedule} alt="" aria-hidden="true" />
          )}
          <p>{filter === "mine" ? tx("Nenhuma função na sua escala por enquanto. Veja a programação completa!") : tx("A programação ainda não foi publicada.")}</p>
          {filter === "mine" && items.length > 0 && (
            <button type="button" className="button button--primary" onClick={() => setFilter("all")}>
              <img className="admin-head__action-icon" src={ICONS.schedule} alt="" aria-hidden="true" /> {tx("Ver tudo")}
            </button>
          )}
        </div>
      )}

      {pastCount > 0 && pastCount < visible.length && (
        <button type="button" className={`past-toggle ${showPast ? "past-toggle--open" : ""}`} aria-expanded={showPast} onClick={() => setShowPast((v) => !v)}>
          <span className="past-toggle__icon" aria-hidden="true">
            {showPast ? "▾" : "▸"}
          </span>
          <span className="past-toggle__label">
            {showPast ? tx("Esconder o que já aconteceu") : pastCount === 1 ? tx("{n} item já aconteceu", { n: pastCount }) : tx("{n} itens já aconteceram", { n: pastCount })}
          </span>
          <span className="past-toggle__hint">{showPast ? tx("recolher") : tx("mostrar")}</span>
        </button>
      )}

      {days.map((d) => (
        <section key={d} className="day-group">
          <header className="room-group__head">
            <h2 className="room-group__title room-group__title--green">📆 {speakDay(d)}</h2>
            {d === now.date && <span className="room-group__stats">{tx("hoje")}</span>}
          </header>
          <ol className="timeline">
            {shown
              .filter((i) => i.event.date === d)
              .map((i) => {
                const e = i.event;
                const isNow = e.id === current;
                return (
                  <li key={e.id} className={`timeline__item ${isNow ? "timeline__item--now" : ""}`}>
                    <div className="timeline__time">
                      <span className="timeline__start">{e.startTime}</span>
                      {e.endTime && <span className="timeline__end">{e.endTime}</span>}
                    </div>
                    <div className={`event-card ${!i.role ? "event-card--plain" : ""} ${isNow ? "event-card--now" : ""}`}>
                      <h3 className="event-card__title">
                        {isNow && <span className="event-card__now">{tx("agora")}</span>}
                        <span aria-hidden="true">{e.emoji}</span> {e.title}
                      </h3>
                      {e.notes && <p className="staff-card__meta">{e.notes}</p>}
                      {i.role && (
                        <div className="staff-card__tags my-role">
                          <span
                            className={`staff-tag ${i.implicit ? "staff-tag--everyone" : ""}`}
                            title={i.implicit && i.role ? tx("Função automática de {audience}", { audience: autoAudienceLabel(i.role) }) : tx("Você está escalado(a) nesta função")}
                          >
                            {i.role.emoji} {i.role.name}
                            {i.detail && <span className="staff-tag__n">{i.detail}</span>}
                          </span>
                          {i.role.instructions && (
                            <button type="button" className="link-btn" onClick={() => setInstructionsFor(i)}>
                              {tx("📝 instruções")}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
          </ol>
        </section>
      ))}

      <InstructionsDialog
        role={instructionsFor?.role ?? null}
        context={instructionsFor ? tx("em {emoji} {title} · {when}", { emoji: instructionsFor.event.emoji, title: instructionsFor.event.title, when: `${speakDay(instructionsFor.event.date, "weekday")} ${instructionsFor.event.startTime}` }) : undefined}
        onClose={() => setInstructionsFor(null)}
      />
    </div>
  );
}
