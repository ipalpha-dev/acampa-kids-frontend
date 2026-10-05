import { useCallback, useMemo, useState } from "react";
import { GROUP_META } from "../api/bedrooms";
import { birthdayDuringCamp, type Camper } from "../api/campers";
import { ROOM_ROLE_META, staffSex } from "../api/staff";
import CamperCard from "../components/CamperCard";
import GroupIcon from "../components/GroupIcon";
import GuardianWhatsApp from "../components/GuardianWhatsApp";
import RoomRoleIcon from "../components/RoomRoleIcon";
import TeamTag from "../components/TeamTag";
import WhatsAppButton from "../components/WhatsAppButton";
import { formatBrazilPhoneClient } from "../phoneFormat";
import { staffGreeting, whatsappLink } from "../whatsapp";
import KidIcon from "../components/KidIcon";
import PlayScene from "../components/PlayScene";
import SelfCheckinCard from "../components/SelfCheckinCard";
import MedicationChecklist from "../components/MedicationChecklist";
import StaffIcon from "../components/StaffIcon";
import BusLogo from "../components/BusLogo";
import { kidSexOf } from "../icons";
import type { LoggedUser } from "../roles";
import { useCollection } from "../store";
import { useLabelOf, useMyRoom, useTransportOf } from "../store/derive";
import { useRoute } from "../router";
import CamperDetail from "./admin/CamperDetail";
import { speakDaySlash, speakWhen, todayIso } from "../dates";
import { useI18n } from "../i18n";

interface HomePageProps {
  user: LoggedUser;
  token: string;
  /** MEDICAL team: their Início opens with today's medication checklist */
  medical?: boolean;
}


interface RoomBirthday {
  kid: Camper;
  /** "YYYY-MM-DD" of the birthday inside the camp */
  day: string;
  /** age the kid turns that day */
  age: number | null;
}

/**
 * The kids of the room whose birthday falls on a camp day (first → last event
 * day), sorted by day. Empty without a programme.
 */
function useRoomBirthdays(kids: Camper[]): RoomBirthday[] {
  const events = useCollection("events");
  return useMemo(() => {
    if (!events?.length) return [];
    const dates = events.map((e) => e.date).sort();
    const from = dates[0];
    const until = dates[dates.length - 1];
    return kids
      .flatMap((kid) => {
        const day = birthdayDuringCamp(kid.birthDate, from, until);
        if (!day) return [];
        const age = kid.birthDate ? Number(day.slice(0, 4)) - Number(kid.birthDate.slice(0, 4)) : null;
        return [{ kid, day, age }];
      })
      .sort((a, b) => a.day.localeCompare(b.day));
  }, [events, kids]);
}

/**
 * MEDICAL team, on Início: today's medication checklist — the very same
 * component the Medicações tab shows, under this page's own heading, so the
 * experience is identical in both tabs. Other days are only on that tab.
 */
function MedicationsToday({ token }: { token: string }) {
  const { tx } = useI18n();
  return <MedicationChecklist token={token} day={todayIso()} variant="card" title={tx("Medicações de hoje")} />;
}

/**
 * The logged-in team member's assigned bus. Hidden when they have no vehicle
 * or it is a car — going by car they already know the ride.
 */
function StaffBusCard({ transportId }: { transportId: string | null }) {
  const { tx } = useI18n();
  const t = useTransportOf()(transportId);
  if (!t || t.kind !== "bus") return null;
  return (
    <section className="staff-bus" aria-label={tx("Seu ônibus: {label}", { label: t.label })}>
      <span className="staff-bus__mark" aria-hidden="true">
        <BusLogo color={t.color ?? "#0f9a8a"} number={t.number} size={52} />
      </span>
      <div className="staff-bus__body">
        <p className="staff-bus__kicker">{tx("Seu ônibus")}</p>
        <h2 className="staff-bus__title">{t.label}</h2>
        <p className="staff-bus__text">{tx("É neste que você vai.")}</p>
      </div>
    </section>
  );
}

/** 🎂 banner: every kid of the room whose birthday is on a camp day (today highlighted) */
function BirthdayBanner({ birthdays, onOpen }: { birthdays: RoomBirthday[]; onOpen: (id: string) => void }) {
  const { tx } = useI18n();
  if (birthdays.length === 0) return null;
  const today = todayIso();
  return (
    <section className="birthday-banner" aria-label={tx("Aniversários no acampamento")}>
      <span className="birthday-banner__emoji" aria-hidden="true">🎂</span>
      <div className="birthday-banner__body">
        <h2 className="birthday-banner__title">{tx("Aniversário no acampamento!")}</h2>
        <ul className="birthday-banner__list">
          {birthdays.map(({ kid, day, age }) => {
            const isToday = day === today;
            return (
              <li key={kid.id} className={isToday ? "birthday-banner__item--today" : undefined}>
                <button type="button" className="link-btn" title={tx("Ver criança")} onClick={() => onOpen(kid.id)}>
                  {kid.name}
                </button>{" "}
                {isToday ? tx("faz") : tx("faz aniversário")} {age !== null && tx("{age} anos", { age })} {isToday ? <strong>{tx("hoje")}</strong> : `· ${speakDaySlash(day)}`}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/**
 * "Início" for a team member: their room — the kids under THEIR care (a
 * caretaker), the other kids of the room (collapsed; the server only sends
 * them while the camp is happening) and the colleagues sharing it. For
 * colleagues only the name and room role are shown (the server already
 * strips phones and health data of other staff; the UI never asks for them).
 * Guardian / emergency data never reaches this page.
 */
export default function HomePage({ user, token, medical = false }: HomePageProps) {
  const { tx } = useI18n();
  const data = useMyRoom(user.personId);
  const labelOf = useLabelOf();
  const settings = useCollection("settings");
  const bedrooms = useCollection("bedrooms") ?? [];
  const { navigate, segments } = useRoute();
  const [showOthers, setShowOthers] = useState(false);
  /** #/home/<camperId> → the kid's page (only the kids the server sent me are in the store) */
  const openKid = segments[0] === "home" ? segments[1] : undefined;
  const setTitle = useCallback(() => {}, []);
  const openCamper = (id: string) => navigate(`/home/${id}`);
  const first = user.name.split(" ")[0];
  const access = settings?.staffAccessWindow;
  /** the room's kids the server sent me (mine + the others during the camp) */
  const roomKids = useMemo(() => (data ? [...data.myKids, ...data.campers] : []), [data]);
  const birthdays = useRoomBirthdays(roomKids);

  // ordinary team member outside the access window: the server sends no staff record at all
  if (data === undefined && access && !access.open) {
    return (
      <div className="admin-page">
        <h1 className="admin-title">{tx("Olá, {name}! 👋", { name: first })}</h1>
        <p className="opt-empty">
          {tx("O app ainda não está liberado para a equipe.")}
          <br />
          {access.from && new Date(access.from).getTime() > Date.now() ? tx("Abre {when}.", { when: speakWhen(access.from, { long: true }) }) : tx("O período de acesso já terminou.")}
        </p>
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="admin-page">
        <p className="opt-empty">{tx("Sincronizando com o servidor… 🏕️")}</p>
      </div>
    );
  }

  if (data === undefined) {
    return (
      <div className="admin-page">
        <h1 className="admin-title">{tx("Olá, {name}! 👋", { name: first })}</h1>
        <p className="opt-empty">
          {tx("Seu celular ainda não está vinculado a um cadastro da equipe.")}
          <br />
          {tx("Fale com a organização para ajustar o seu cadastro.")}
        </p>
      </div>
    );
  }

  const { me, bedroom, myKids, campers, roommates } = data;
  const caretaker = me.roomRole === "caretaker";

  if (openKid) {
    return <CamperDetail token={token} camperId={openKid} nav={{ crumbs: [{ label: tx("Início"), onClick: () => navigate("/home") }, { label: tx("Criança") }], setTitle }} onOpenCamper={openCamper} canEditHealth={medical} />;
  }

  if (!bedroom) {
    return (
      <div className="admin-page">
        <h1 className="admin-title">{tx("Olá, {name}! 👋", { name: first })}</h1>
        <StaffBusCard transportId={me.transportation} />
        <SelfCheckinCard token={token} user={user} />
        {/* the medical team works from this list even without a room of their own */}
        {medical && <MedicationsToday token={token} />}
        <p className="opt-empty">
          {tx("Você ainda não tem um quarto definido.")}
          <br />
          {tx("Assim que a organização te alocar, ele aparece aqui.")}
        </p>
      </div>
    );
  }

  const m = GROUP_META[bedroom.group];
  const isStaffRoom = bedroom.group === "staff";
  /** the wing decides the playful strip at the bottom (ball/car/kite vs ballerina/butterfly/unicorn) */
  const sex = kidSexOf(bedroom.group);

  return (
    <div className="admin-page">
      <header className="admin-head">
        <h1 className={`admin-title detail-title room-group__title--${m.color}`}>
          <GroupIcon group={bedroom.group} /> {tx("Quarto {name}", { name: bedroom.name })}
        </h1>
      </header>
      <p className="admin-intro">
        {tx("Olá, {name}! Este é o seu quarto.", { name: first })}{" "}
        {isStaffRoom ? tx("Aqui ficam só pessoas da equipe.") : caretaker ? tx("Você é líder de crianças deste quarto.") : tx("Você é auxiliar neste quarto.")}
      </p>

      <StaffBusCard transportId={me.transportation} />

      {/* a kid of the room has their birthday on a camp day */}
      {!isStaffRoom && <BirthdayBanner birthdays={birthdays} onOpen={openCamper} />}

      {/* departure day only: "Cheguei na igreja!" */}
      <SelfCheckinCard token={token} user={user} />

      {/* MEDICAL team: today's checklist — the same component as the Medicações tab (other days live there) */}
      {medical && <MedicationsToday token={token} />}

      {/* ── my kids (caretaker only) ── */}
      {!isStaffRoom && caretaker && (
        <section className="detail-section">
          <h2 className="detail-h2">
            <KidIcon sex={sex} group size={26} /> {tx("Minhas crianças")} <span className="cat-tab__count">{myKids.length}</span>
          </h2>
          <p className="admin-intro">{tx("Você é o líder delas.")}</p>
          {myKids.length === 0 ? (
            <p className="opt-empty">{tx("Nenhuma criança sob sua responsabilidade ainda.")}</p>
          ) : (
            <ul className="kid-list">
              {myKids.map((k) => (
                <CamperCard key={k.id} camper={k} labelOf={labelOf} hideBedroom onOpen={openCamper} corner={<GuardianWhatsApp camper={k} />} />
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ── colleagues: name, room role and phone ── */}
      {/* alone in the room: phones drop the whole block (CSS) — a heading, a
          “0 pessoas” count and an empty note is a lot of screen to say nothing */}
      <section className={`detail-section roommate-section ${roommates.length === 0 ? "roommate-section--empty" : ""}`}>
        <div className="roommate-head">
          <h2 className="detail-h2">
            <StaffIcon size={24} /> {tx("Equipe no quarto")}
          </h2>
          <span className="roommate-count">
            {roommates.length} {roommates.length === 1 ? tx("pessoa") : tx("pessoas")}
          </span>
        </div>
        {roommates.length === 0 ? (
          <p className="opt-empty">{tx("Só você neste quarto. 😊")}</p>
        ) : (
          <ul className="roommate-list" aria-label={tx("Equipe no quarto")}>
            {roommates.map((r) => (
              <li key={r.id} className="roommate-card">
                <span className={`roommate-card__icon roommate-card__icon--${r.roomRole}`} aria-hidden="true">
                  <RoomRoleIcon role={r.roomRole} sex={staffSex(r, bedrooms)} size={40} />
                </span>
                <span className="roommate-card__body">
                  <strong className="roommate-card__name">{r.name}</strong>
                  <span className="roommate-card__role">
                    {tx(ROOM_ROLE_META[r.roomRole].label)}
                    {r.phone && <> · {formatBrazilPhoneClient(r.phone)}</>}
                  </span>
                  <TeamTag teamId={r.team} className="staff-tag--inline roommate-card__team" />
                </span>
                {r.phone && (
                  <WhatsAppButton
                    className="wa-btn--sm roommate-card__wa"
                    href={whatsappLink(r.phone, staffGreeting({ toName: r.name, fromName: user.name }))}
                    label={tx("Falar com {name} no WhatsApp", { name: r.name.split(" ")[0] })}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── the other kids of the room: collapsed; only sent by the server while the camp is happening ── */}
      {!isStaffRoom && (campers.length > 0 || !caretaker) && (
        <section className="detail-section">
          <button type="button" className={`disclosure ${showOthers ? "disclosure--open" : ""}`} aria-expanded={showOthers} onClick={() => setShowOthers((v) => !v)}>
            <span className="disclosure__arrow" aria-hidden="true">▶</span>
            {caretaker ? tx("Outras crianças do quarto") : tx("Crianças do quarto")} <span className="cat-tab__count">{campers.length}</span>
            <span className="disclosure__hint">{tx("para ajudar os colegas com saúde e cuidados")}</span>
          </button>
          {showOthers &&
            (campers.length === 0 ? (
              <p className="opt-empty">{tx("As crianças do quarto aparecem aqui durante o acampamento.")}</p>
            ) : (
              <ul className="kid-list">
                {campers.map((k) => (
                  <CamperCard key={k.id} camper={k} labelOf={labelOf} hideBedroom onOpen={openCamper} corner={<GuardianWhatsApp camper={k} />} />
                ))}
              </ul>
            ))}
        </section>
      )}

      <PlayScene sex={sex} />
    </div>
  );
}
