import { useEffect, useMemo, useRef, useState } from "react";
import { createBedroom } from "../api/bedrooms";
import { createTransport, type TransportInput } from "../api/transports";
import { createEvent, createRole } from "../api/schedule";
import { createInstruction } from "../api/instructions";
import { createPrepSection } from "../api/preparation";
import { fetchSeeds, type SeedBus, type SeedDocs, type Seeds } from "../api/seeds";
import { fetchSampleEnabled, loadSampleCamp, type SampleLoad } from "../api/wizard";
import { ApiError } from "../api/client";
import { applySampleSchedule } from "./sampleSchedule";
import { sampleSchedulePlan } from "./sampleScheduleDates";
import { mapsLink, updateSettings, type NotificationSettings } from "../api/settings";
import AdminsEditor from "../components/AdminsEditor";
import SpotMap from "../components/SpotMap";
import Toggle from "../components/Toggle";
import AccessWindowCard from "../pages/admin/AccessWindowCard";
import BusAssignPage from "../pages/admin/BusAssignPage";
import CheckinSettingsPage from "../pages/admin/CheckinSettingsPage";
import RoomAssignPage from "../pages/admin/RoomAssignPage";
import BedroomsPage from "../pages/admin/BedroomsPage";
import CamperImportPage from "../pages/admin/CamperImportPage";
import StaffImportPage from "../pages/admin/StaffImportPage";
import { useRoute } from "../router";
import { useCollection, useCollectionOrEmpty, useHydrated } from "../store";
import { ICONS } from "../icons";
import type { LoggedUser } from "../roles";
import type { CampSummary } from "../auth/store";
import { CAMP_SPOT_RADIUS_M, type KnownPlace, type KnownPlaceRoom } from "./places";
import { DAY_LABELS, type TemplateEvent, type TemplateRole } from "./scheduleTemplate";
import { defaultSeeds } from "./defaults";
import PreviousYearStep from "./PreviousYearStep";
import RoomsEditor from "./RoomsEditor";
import { recalledWizardPlace, rememberWizardPlace, setWizardDismissed, type WizardPlaceChoice } from "./state";
import { collatorLocale, useI18n } from "../i18n";

/**
 * 🏕️ Assistente de configuração — the guided setup that takes a freshly
 * cleaned (or brand-new) camp from zero to ready: invite the admin, import
 * the team and the kids, pick the known camp site (rooms + address), prefill
 * the programme, write the first documents, set the important windows and
 * lists, then organize rooms and buses.
 *
 * Every step reuses the SAME components the app's own sections use (the
 * import pages, the access-window cards, the check-in settings page, the
 * room / bus boards), so the wizard keeps working as those screens evolve.
 * Steps can be skipped and revisited — the stepper on top jumps anywhere.
 */

type StepId = "intro" | "admins" | "previous" | "staff" | "campers" | "venue" | "schedule" | "docs" | "config" | "rooms" | "buses" | "done";

interface StepMeta {
  id: StepId;
  label: string;
  emoji?: string;
  icon?: string;
}

const ALL_STEPS: readonly StepMeta[] = [
  { id: "intro", label: "Boas-vindas", emoji: "🏕️" },
  { id: "admins", label: "Admins", emoji: "🔑" },
  { id: "previous", label: "Outros anos", icon: ICONS.previousYear },
  { id: "staff", label: "Equipe", icon: ICONS.staffPair },
  { id: "campers", label: "Acampantes", icon: ICONS.importCampers },
  { id: "venue", label: "Local", emoji: "📍" },
  { id: "schedule", label: "Programação", icon: ICONS.schedule },
  { id: "docs", label: "Documentos", emoji: "📖" },
  { id: "config", label: "Configurações", emoji: "⚙️" },
  { id: "rooms", label: "Quartos", icon: ICONS.roomAssign },
  { id: "buses", label: "Ônibus", icon: ICONS.transport },
  { id: "done", label: "Pronto", emoji: "🎉" },
] as const;

interface WizardPageProps {
  token: string;
  user: LoggedUser;
  camp: CampSummary;
  /** every camp this session may switch into — empty when it can't switch years */
  camps: CampSummary[];
  /** leave the wizard (back to the app) */
  onExit: () => void;
}

export default function WizardPage({ token, user, camp, camps, onExit }: WizardPageProps) {
  const { tx } = useI18n();
  const { params, navigate } = useRoute();
  const settings = useCollection("settings");

  // Only the deployment owner (super admin) manages admins — everyone else
  // skips that step entirely. "Outros anos" only shows up when another camp exists.
  const STEPS = useMemo(
    () => ALL_STEPS.filter((s) => (s.id !== "admins" || !!settings?.superAdmin) && (s.id !== "previous" || camps.length > 1)),
    [settings?.superAdmin, camps.length],
  );

  const asked = params.get("step") as StepId | null;
  const step: StepId = STEPS.some((s) => s.id === asked) ? (asked as StepId) : "intro";
  const index = STEPS.findIndex((s) => s.id === step);
  const go = (id: StepId) => navigate("/wizard", { query: { step: id } });
  const next = () => go(STEPS[Math.min(index + 1, STEPS.length - 1)].id);
  const prev = () => go(STEPS[Math.max(index - 1, 0)].id);

  // 🌱 what the wizard imports: the super admin's saved seeds (⚙️ → Sementes),
  // falling back to the app's built-in defaults when nothing was saved (or offline)
  const [seeds, setSeeds] = useState<Seeds | null>(null);
  useEffect(() => {
    let alive = true;
    fetchSeeds(token)
      .then((s) => alive && setSeeds(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [token]);
  const templates = useMemo(() => seeds ?? defaultSeeds(), [seeds]);

  // each step starts at the top of the wizard body
  useEffect(() => {
    for (const selector of [".dash-scroll", ".dash"]) {
      const scroller = document.querySelector(selector);
      if (scroller) scroller.scrollTop = 0;
    }
    window.scrollTo({ top: 0 });
  }, [step]);

  async function close() {
    setWizardDismissed(true);
    try {
      // the deployment owner is never locked — don't drop the new admin's lock by leaving
      if (settings?.wizardMode && !settings.superAdmin) await updateSettings(token, { wizardMode: false });
    } catch {
      /* leaving still — the next login will retry the lock if the write failed */
    }
    onExit();
  }

  return (
    <div className="wizard">
      <header className="wizard__head">
        <div className="wizard__heading">
          <img className="wizard__icon" src={ICONS.wizard} alt="" aria-hidden="true" />
          <div>
            <h1 className="wizard__title">{tx("Assistente de configuração")}</h1>
            <p className="wizard__subtitle">
              {tx("Etapa {n} de {total} · {label} — dá para pular etapas e voltar quando quiser.", { n: index + 1, total: STEPS.length, label: tx(STEPS[index].label) })}
            </p>
          </div>
        </div>
        <button type="button" className="wizard__close" onClick={() => void close()} title={tx("Sair do assistente")}>
          ✕ {tx("Sair")}
        </button>
      </header>

      <div className="wizard__nav">
        <nav className="wizard__steps" aria-label={tx("Etapas")}>
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className={`wizard__step ${s.id === step ? "wizard__step--current" : ""} ${i < index ? "wizard__step--seen" : ""}`}
              aria-current={s.id === step ? "step" : undefined}
              title={tx(s.label)}
              onClick={() => go(s.id)}
            >
              <span className="wizard__step-mark" aria-hidden="true">
                {s.icon ? <img src={s.icon} alt="" /> : s.emoji}
              </span>
              <span className="wizard__step-label">{tx(s.label)}</span>
            </button>
          ))}
        </nav>
        <div
          className="wizard__progress"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
          aria-valuenow={index + 1}
          aria-label={tx("Etapa {n} de {total}", { n: index + 1, total: STEPS.length })}
        >
          <span style={{ width: `${((index + 1) / STEPS.length) * 100}%` }} />
        </div>
      </div>

      <div className="wizard__body">
        {step === "intro" && <IntroStep token={token} onNext={next} onSkip={close} />}
        {step === "admins" && <AdminsStep token={token} user={user} />}
        {step === "previous" && <PreviousYearStep token={token} camp={camp} camps={camps} />}
        {step === "staff" && (
          <StepShell>
            <StaffImportPage token={token} onBack={next} />
          </StepShell>
        )}
        {step === "campers" && (
          <StepShell>
            <CamperImportPage token={token} onDone={next} />
          </StepShell>
        )}
        {step === "venue" && <VenueStep token={token} places={templates.places} onNext={next} />}
        {step === "schedule" && <ScheduleStep token={token} roles={templates.roles} events={templates.events} />}
        {step === "docs" && <DocsStep token={token} docs={templates.docs} />}
        {step === "config" && <ConfigStep token={token} />}
        {step === "rooms" && <RoomsStep token={token} />}
        {step === "buses" && <BusesStep token={token} fleet={templates.fleet} />}
        {step === "done" && <DoneStep onExit={close} />}
      </div>

      {step !== "intro" && step !== "done" && (
        <footer className="wizard__foot">
          <button type="button" className="button button--secondary" disabled={index === 0} onClick={prev}>
            {tx("‹ Voltar")}
          </button>
          <button type="button" className="button button--secondary" onClick={next}>
            {tx("Pular {label}", { label: tx(STEPS[index].label) })}
          </button>
          {/* each step carries its own continue; the footer only needs one on the very last step */}
          {index === STEPS.length - 2 && (
            <button type="button" className="button button--primary" onClick={next}>
              {tx("Continuar ›")}
            </button>
          )}
        </footer>
      )}
    </div>
  );
}

// ── intro ───────────────────────────────────────────────────────────────────

export function IntroStep({ token, onNext, onSkip }: { token: string; onNext: () => void; onSkip: () => void }) {
  const { tx, te } = useI18n();
  /** the fictional sample exists only in preview / dev (GET /api/wizard/sample → {enabled}) */
  const [sampleEnabled, setSampleEnabled] = useState(false);
  useEffect(() => {
    let alive = true;
    void fetchSampleEnabled(token).then((on) => alive && setSampleEnabled(on));
    return () => {
      alive = false;
    };
  }, [token]);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<(SampleLoad & { events: number }) | null>(null);
  const roles = useCollectionOrEmpty("roles");
  const events = useCollectionOrEmpty("events");

  async function loadSample() {
    if (testing || loaded) return;
    setTesting(true);
    setError(null);
    try {
      const r = await loadSampleCamp(token);
      const applied = await applySampleSchedule(token, sampleSchedulePlan(), { roles, events });
      setLoaded({ ...r, events: applied.events });
    } catch (e) {
      // the server says the sample is off here after all: the option simply goes away
      if (e instanceof ApiError && e.code === "SAMPLE_DISABLED") setSampleEnabled(false);
      else setError(te(e, "Algo deu errado."));
    } finally {
      setTesting(false);
    }
  }

  if (loaded) {
    return (
      <section className="wizard-card wizard-card--intro">
        <div className="confetti" aria-hidden="true">🏕️ 🚌 🛏️ 📅 🎉</div>
        <h2 className="wizard-card__title">{tx("Camp de exemplo pronto! 🎉")}</h2>
        <ul className="wizard-summary">
          <li className="wizard-summary__ok"><span aria-hidden="true">✅</span> <strong>{tx("{n} acampantes", { n: loaded.campers })}</strong></li>
          <li className="wizard-summary__ok"><span aria-hidden="true">✅</span> <strong>{tx("{n} pessoas na equipe", { n: loaded.staff })}</strong></li>
          <li className="wizard-summary__ok"><span aria-hidden="true">✅</span> {tx("{n} quartos", { n: loaded.bedrooms })} · {tx("{n} veículos", { n: loaded.transports })} · {tx("{n} times", { n: loaded.teams })} · {tx("{n} eventos", { n: loaded.events })}</li>
        </ul>
        <p className="cat-hint">{tx("Tudo")} <strong>{tx("fictício")}</strong>{tx(", valendo a partir de hoje. Explore as abas ou siga o passo a passo.")}</p>
        <div className="cat-form__actions">
          <button type="button" className="button button--secondary" onClick={onSkip}>
            {tx("Explorar o app")}
          </button>
          <button type="button" className="button button--primary" onClick={onNext}>
            {tx("Continuar o assistente ›")}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="wizard-card wizard-card--intro">
      <h2 className="wizard-card__title">{tx("Vamos montar o acampamento! 🏕️")}</h2>
      {error && <p className="message message--error">{error}</p>}
      <div className="wizard-choice">
        {sampleEnabled && (
          <button type="button" className="wizard-choice__card" disabled={testing} onClick={() => void loadSample()}>
            <img className="wizard-choice__art" src={ICONS.wizardSample} alt="" aria-hidden="true" />
            <span className="wizard-choice__title">{testing ? tx("Carregando… 🧪") : tx("Ver funcionando")}</span>
            <span className="wizard-choice__hint">{tx("Um acampamento de exemplo, fictício")}</span>
          </button>
        )}
        <button type="button" className="wizard-choice__card" disabled={testing} onClick={onNext}>
          <img className="wizard-choice__art" src={ICONS.wizard} alt="" aria-hidden="true" />
          <span className="wizard-choice__title">{tx("Montar do zero")}</span>
          <span className="wizard-choice__hint">{tx("Passo a passo, do começo ao fim")}</span>
        </button>
      </div>
      <button type="button" className="link-btn wizard-choice__skip" onClick={onSkip}>
        {tx("Agora não")}
      </button>
    </section>
  );
}

// ── admins (super user invites the admin) ──────────────────────────────────

function AdminsStep({ token, user }: { token: string; user: LoggedUser }) {
  const { tx } = useI18n();
  return (
    <section className="wizard-card">
      <h2 className="wizard-card__title">{tx("🔑 Administradores")}</h2>
      <p className="admin-intro">
        {tx("Quem serve na coordenação recebe esse papel no IPAlpha (Oikos). Depois é só mandar o link: a pessoa entra com o próprio celular, com um código por SMS.")}
      </p>
      <AdminsEditor token={token} user={user} />
    </section>
  );
}

// ── venue (known camping places) ───────────────────────────────────────────

const spotDraft = (v: string) => v.replace(",", ".");

function VenueStep({ token, places, onNext }: { token: string; places: KnownPlace[]; onNext: () => void }) {
  const { tx, te } = useI18n();
  const settings = useCollection("settings");
  const bedrooms = useCollectionOrEmpty("bedrooms");
  const recalled = useRef(recalledWizardPlace()).current;
  const [placeId, setPlaceId] = useState<string>(recalled?.id ?? places[0]?.id ?? "");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [rooms, setRooms] = useState<KnownPlaceRoom[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(0);

  // fill from the catalog (or from what this device already chose)
  useEffect(() => {
    const place = places.find((p) => p.id === placeId);
    if (place) {
      setName(place.name);
      setAddress(recalled?.id === place.id ? recalled.address : place.address);
      setLat(place.lat != null ? String(place.lat) : "");
      setLng(place.lng != null ? String(place.lng) : "");
      setRooms(place.rooms.map((r) => ({ ...r })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeId, places]);

  const latN = Number(spotDraft(lat));
  const lngN = Number(spotDraft(lng));
  const coordsOk = !lat && !lng ? true : Number.isFinite(latN) && Math.abs(latN) <= 90 && Number.isFinite(lngN) && Math.abs(lngN) <= 180;
  const capacity = rooms.reduce((n, r) => n + (r.bunkBeds ?? 0) * 2 + (r.singleBeds ?? 0), 0);
  const roomsOk = rooms.every((r) => r.bunkBeds !== null && r.singleBeds !== null);
  /** rooms the camp doesn't have yet (matched by name + wing) */
  const existing = useMemo(() => new Set(bedrooms.map((b) => `${b.group}:${b.name.trim()}`)), [bedrooms]);
  const toCreate = rooms.filter((r) => r.name.trim() && !existing.has(`${r.group}:${r.name.trim()}`));

  async function apply() {
    if (busy || !coordsOk || !roomsOk) return;
    setBusy(true);
    setError(null);
    try {
      let created = 0;
      for (const r of toCreate) {
        await createBedroom(token, { name: r.name.trim(), group: r.group, bunkBeds: r.bunkBeds!, singleBeds: r.singleBeds!, notes: "" });
        created++;
      }
      if (coordsOk && lat && lng) {
        const spot = { id: "acampamento", name: "Acampamento", lat: latN, lng: lngN, radiusM: CAMP_SPOT_RADIUS_M };
        const others = (settings?.checkinLocations ?? []).filter((l) => l.id !== spot.id);
        await updateSettings(token, { checkinLocations: [...others, spot] });
      }
      rememberWizardPlace({ id: placeId, name: name.trim() || "Acampamento", address: address.trim() });
      setApplied(created);
    } catch (e) {
      setError(te(e, "Algo deu errado."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="wizard-card">
      <h2 className="wizard-card__title">{tx("📍 O local do acampamento")}</h2>
      <p className="admin-intro">
        {tx("O assistente conhece os lugares que a igreja já usa — os")} <strong>{tx("quartos com as camas")}</strong>{tx(", o endereço e a localização vêm preenchidos. Confira, ajuste o que mudou e aplique.")}
      </p>

      <div className="big-options">
        {places.map((p) => (
          <button key={p.id} type="button" className={`big-option ${placeId === p.id ? "big-option--on" : ""}`} aria-pressed={placeId === p.id} disabled={busy} onClick={() => setPlaceId(p.id)}>
            <span className="big-option__emoji" aria-hidden="true">🏕️</span>
            <span className="big-option__label">{p.name}</span>
            <span className="big-option__hint">{tx("{n} quartos", { n: p.rooms.length })}</span>
          </button>
        ))}
      </div>
      {places.find((p) => p.id === placeId)?.notes && <p className="cat-hint">{places.find((p) => p.id === placeId)!.notes}</p>}

      <div className="cat-form__row staff-form__row">
        <label className="cat-field cat-field--grow">
          <span className="cat-field__label">{tx("Nome do local")}</span>
          <input className="cat-input" value={name} maxLength={80} disabled={busy} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="cat-field cat-field--grow">
          <span className="cat-field__label">{tx("Endereço")}</span>
          <input className="cat-input" placeholder={tx("Rua, número, cidade")} value={address} maxLength={160} disabled={busy} onChange={(e) => setAddress(e.target.value)} />
        </label>
      </div>
      <div className="cat-form__row staff-form__row">
        <label className="cat-field cat-field--grow">
          <span className="cat-field__label">{tx("Latitude")}</span>
          <input className="cat-input" inputMode="decimal" placeholder="-23.480536" value={lat} disabled={busy} onChange={(e) => setLat(e.target.value)} />
        </label>
        <label className="cat-field cat-field--grow">
          <span className="cat-field__label">{tx("Longitude")}</span>
          <input className="cat-input" inputMode="decimal" placeholder="-46.830779" value={lng} disabled={busy} onChange={(e) => setLng(e.target.value)} />
        </label>
      </div>
      {!coordsOk && <p className="cat-hint cat-hint--error">{tx("Latitude entre -90 e 90, longitude entre -180 e 180.")}</p>}
      {lat && lng && coordsOk && (
        <SpotMap lat={latN} lng={lngN} radiusM={CAMP_SPOT_RADIUS_M} onMove={(p) => { setLat(String(p.lat)); setLng(String(p.lng)); }} />
      )}

      <div className="list-head">
        <h3 className="cat-form__title">
          {tx("Quartos")} {!capacity || <span className="cat-tab__count">{tx("{rooms} · {beds} camas", { rooms: rooms.length, beds: capacity })}</span>}
        </h3>
      </div>
      <RoomsEditor rooms={rooms} onChange={setRooms} disabled={busy} />

      {error && <p className="message message--error">{error}</p>}
      {applied > 0 && <p className="message message--ok">{tx("✅ {n} quarto(s) criado(s){spot}. Continue nos passos de Quartos para alocar as crianças.", { n: applied, spot: lat && lng ? tx(" e ponto do acampamento salvo") : "" })}</p>}
      {applied === 0 && bedrooms.length > 0 && <p className="cat-hint">{tx("O acampamento já tem {n} quarto(s); só os novos nomes serão criados.", { n: bedrooms.length })}</p>}
      <div className="cat-form__actions">
        <button type="button" className="button button--primary" disabled={busy || !coordsOk || !roomsOk || (toCreate.length === 0 && !(lat && lng))} onClick={() => void apply()}>
          {busy ? tx("Aplicando…") : toCreate.length > 0 ? tx("Aplicar ({n} quartos)", { n: toCreate.length }) : tx("Salvar local")}
        </button>
        <button type="button" className="button button--secondary" onClick={onNext}>
          {tx("Continuar ›")}
        </button>
      </div>
    </section>
  );
}

// ── schedule prefill ───────────────────────────────────────────────────────

function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function nextFriday(): string {
  const d = new Date();
  const delta = ((5 - d.getDay() + 7) % 7) || 7;
  d.setDate(d.getDate() + delta);
  return isoDate(d);
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

function ScheduleStep({ token, roles, events }: { token: string; roles: TemplateRole[]; events: TemplateEvent[] }) {
  const { tx, te } = useI18n();
  const existingEvents = useCollectionOrEmpty("events");
  const existingRoles = useCollectionOrEmpty("roles");
  const [firstDay, setFirstDay] = useState(nextFriday);
  const [kept, setKept] = useState<Set<number>>(() => new Set(events.map((_, i) => i)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  const roleByKey = useMemo(() => new Map(roles.map((r) => [r.key, r])), [roles]);
  const selected = events.filter((_, i) => kept.has(i));
  const roleKeys = useMemo(() => [...new Set(selected.flatMap((e) => e.roles))], [selected]);
  const norm = (s: string) => s.trim().toLocaleLowerCase(collatorLocale()).replace(/\s+/g, " ");
  const missingRoles = roleKeys.filter((k) => !existingRoles.some((r) => norm(r.name) === norm(roleByKey.get(k)?.name ?? k)));

  const toggle = (i: number) =>
    setKept((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  const toggleDay = (day: 1 | 2 | 3) =>
    setKept((s) => {
      const dayIdx = events.map((e, i) => [e, i] as const).filter(([e]) => e.day === day);
      const allOn = dayIdx.every(([, i]) => s.has(i));
      const n = new Set(s);
      for (const [, i] of dayIdx) if (allOn) n.delete(i);
      else n.add(i);
      return n;
    });

  async function apply() {
    if (busy || selected.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      // funções first (events reference them); reuse an existing one with the same name
      const byName = new Map(existingRoles.map((r) => [norm(r.name), r.id]));
      const keyToId = new Map<string, string>();
      for (const key of roleKeys) {
        const t = roleByKey.get(key);
        if (!t) continue;
        const found = byName.get(norm(t.name));
        if (found) {
          keyToId.set(key, found);
          continue;
        }
        const created = await createRole(token, {
          name: t.name,
          emoji: t.emoji,
          instructions: "",
          preparation: "",
          forRoomRoles: t.forRoomRoles,
          hasDetail: !!t.hasDetail,
          detailFromTeam: !!t.detailFromTeam,
          detailPlaceholder: t.detailPlaceholder ?? "",
        });
        keyToId.set(key, created.id);
      }
      for (const ev of selected) {
        await createEvent(token, {
          date: addDays(firstDay, ev.day - 1),
          title: ev.title,
          emoji: ev.emoji,
          startTime: ev.start,
          endTime: ev.end,
          notes: ev.notes ?? "",
          roles: ev.roles.map((k) => keyToId.get(k)).filter((x): x is string => !!x),
          visibleToParents: ev.visibleToParents !== false,
        });
      }
      setApplied(true);
    } catch (e) {
      setError(te(e, "Algo deu errado."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="wizard-card">
      <h2 className="wizard-card__title">{tx("📅 Programação modelo")}</h2>
      <p className="admin-intro">
        {tx("A estrutura de um Acampa Kids (sexta à noite → domingo à tarde) já vem pronta,")} <strong>{tx("com as funções de cada evento")}</strong>{tx(". Tire o que não vale neste ano e importe — depois ajuste horários e escala em Programação.")}
      </p>

      <label className="cat-field wizard-firstday">
        <span className="cat-field__label">{tx("Primeiro dia (6ª-feira)")}</span>
        <input className="cat-input" type="date" value={firstDay} disabled={busy} onChange={(e) => setFirstDay(e.target.value)} />
      </label>

      {([1, 2, 3] as const).map((day) => {
        const rows = events.map((e, i) => [e, i] as const).filter(([e]) => e.day === day);
        const on = rows.filter(([, i]) => kept.has(i)).length;
        return (
          <div key={day} className="wizard-day">
            <div className="room-group__head">
              <h3 className="room-group__title room-group__title--green">
                📆 {tx(DAY_LABELS[day])} <span className="cat-hint">{addDays(firstDay, day - 1).split("-").reverse().join("/")}</span>
              </h3>
              <span className="room-group__stats">{on}/{rows.length}</span>
              <button type="button" className="icon-btn" title={on === rows.length ? tx("Desmarcar o dia") : tx("Marcar o dia")} disabled={busy} onClick={() => toggleDay(day)}>
                {on === rows.length ? "−" : "+"}
              </button>
            </div>
            <ul className="wizard-schedule">
              {rows.map(([e, i]) => (
                <li key={i}>
                  <button type="button" className={`wizard-schedule__item ${kept.has(i) ? "wizard-schedule__item--on" : ""}`} aria-pressed={kept.has(i)} disabled={busy} onClick={() => toggle(i)} title={kept.has(i) ? tx("Tirar da importação") : tx("Voltar para a importação")}>
                    <span className="wizard-schedule__time">{e.start}</span>
                    <span className="wizard-schedule__title">
                      <span aria-hidden="true">{e.emoji}</span> {e.title}
                      {e.visibleToParents === false && <span className="cat-hint"> {tx("· só a equipe")}</span>}
                    </span>
                    <span className="wizard-schedule__roles">
                      {e.roles.map((k) => roleByKey.get(k)).filter(Boolean).map((r) => (
                        <span key={r!.key} className="staff-tag" title={tx("Função: {name}", { name: r!.name })}>
                          {r!.emoji}
                        </span>
                      ))}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      {error && <p className="message message--error">{error}</p>}
      {applied && <p className="message message--ok">{tx("✅ Programação importada! Ajuste horários e escala na aba Programação.")}</p>}
      {!applied && existingEvents.length > 0 && <p className="message message--warn">{tx("Já existem {n} evento(s) — a importação acrescenta os marcados abaixo sem tocar nos outros.", { n: existingEvents.length })}</p>}
      <div className="cat-form__actions">
        <span className="cat-hint wizard-schedule__count">
          {tx("{events} evento(s) · {missing} função(ões) nova(s) de {total}", { events: selected.length, missing: missingRoles.length, total: roleKeys.length })}
        </span>
        <button type="button" className="button button--primary" disabled={busy || selected.length === 0} onClick={() => void apply()}>
          {busy ? tx("Importando…") : tx("Importar programação")}
        </button>
      </div>
    </section>
  );
}

// ── first preparation + address instruction ────────────────────────────────

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function DocsStep({ token, docs }: { token: string; docs: SeedDocs }) {
  const { tx, te } = useI18n();
  const instructions = useCollectionOrEmpty("instructions");
  const preparation = useCollectionOrEmpty("preparation");
  const settings = useCollection("settings");
  const recalled = useRef(recalledWizardPlace()).current;
  const campSpot = settings?.checkinLocations.find((l) => l.id === "acampamento");
  const [address, setAddress] = useState(recalled?.address ?? "");
  const [busy, setBusy] = useState<"prep" | "address" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createdPrep, setCreatedPrep] = useState(false);
  const [createdAddress, setCreatedAddress] = useState(false);

  const hasAddressDoc = createdAddress || instructions.some((i) => /endere/i.test(i.title) || i.title.trim().toLocaleLowerCase() === docs.addressTitle.trim().toLocaleLowerCase());
  const hasPrep = createdPrep || preparation.length > 0;
  const maps = campSpot ? mapsLink(campSpot) : null;
  const where = address.trim() || (recalled ? `${recalled.name}${recalled.address ? ` — ${recalled.address}` : ""}` : "");

  async function createAddressDoc() {
    if (busy) return;
    setBusy("address");
    setError(null);
    try {
      const content = `<p><strong>${escapeHtml(recalled?.name ?? "Acampamento")}</strong>${where ? `<br>${escapeHtml(where)}` : ""}</p>${maps ? `<p><a href="${maps}">Ver no Google Maps</a></p>` : ""}`;
      await createInstruction(token, { title: docs.addressTitle, emoji: docs.addressEmoji, audience: "all", content });
      setCreatedAddress(true);
    } catch (e) {
      setError(te(e, "Algo deu errado."));
    } finally {
      setBusy(null);
    }
  }

  async function createFirstPrep() {
    if (busy) return;
    setBusy("prep");
    setError(null);
    try {
      await createPrepSection(token, { title: docs.prepTitle, emoji: docs.prepEmoji, audiences: ["parent", "caretaker", "helper"], content: docs.prepContent });
      setCreatedPrep(true);
    } catch (e) {
      setError(te(e, "Algo deu errado."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="wizard-card">
      <h2 className="wizard-card__title">{tx("📖 Primeiros documentos")}</h2>
      <p className="admin-intro">
        {tx("Dois textos que todo acampamento precisa: a")} <strong>{tx("Preparação")}</strong> {tx("“O que levar na mala” e a instrução com o")}{" "}
        <strong>{tx("endereço do local")}</strong>{tx(". Depois você edita os dois nas páginas de Preparação e Instruções.")}
      </p>
      {error && <p className="message message--error">{error}</p>}

      <section className="cat-form">
        <h3 className="cat-form__title">{docs.addressEmoji} {tx("Instrução com o endereço")}</h3>
        {hasAddressDoc ? (
          <p className="message message--ok">{tx("✅ Instrução de endereço criada — confira em ⚙️ → Instruções.")}</p>
        ) : (
          <>
            <label className="cat-field">
              <span className="cat-field__label">{tx("Endereço")}{recalled ? ` (${recalled.name})` : ""}</span>
              <input className="cat-input" placeholder={tx("Rua, número, cidade")} value={address} maxLength={160} disabled={busy !== null} onChange={(e) => setAddress(e.target.value)} />
            </label>
            {maps && (
              <p className="cat-hint">
                {tx("Localização do passo anterior:")} <a href={maps} target="_blank" rel="noreferrer">{tx("ver no mapa")}</a>
              </p>
            )}
            <div className="cat-form__actions">
              <button type="button" className="button button--primary" disabled={busy !== null || !where} onClick={() => void createAddressDoc()}>
                {busy === "address" ? tx("Criando…") : tx("Criar instrução")}
              </button>
            </div>
          </>
        )}
      </section>

      <section className="cat-form">
        <h3 className="cat-form__title">{docs.prepEmoji} {tx("Primeira Preparação")}</h3>
        {hasPrep ? (
          <p className="message message--ok">{tx("✅ Já existe {n} comunicação(ões) de Preparação.", { n: preparation.length || 1 })}</p>
        ) : (
          <>
            <p className="cat-hint">{tx("“{title}”, publicada para pais, líderes e auxiliares — liste roupas, roupa de cama, bíblia…", { title: docs.prepTitle })}</p>
            <div className="cat-form__actions">
              <button type="button" className="button button--primary" disabled={busy !== null} onClick={() => void createFirstPrep()}>
                {busy === "prep" ? tx("Criando…") : tx("Criar “{title}”", { title: docs.prepTitle })}
              </button>
            </div>
          </>
        )}
      </section>
    </section>
  );
}

// ── the important configs ──────────────────────────────────────────────────

/** every SMS switch (they all start OFF on a fresh camp) */
const ALL_NOTIFICATION_KEYS: (keyof NotificationSettings)[] = [
  "bedroomChanges", "roleChanges", "checkinConfirmation", "contentChanges", "parentContentChanges", "staffChanges", "enrolments",
  "occurrences", "checkinReminder", "parentEdits", "busCheckin", "parentWelcome", "birthdays", "photoPublishes",
];

function NotificationsGateCard({ token }: { token: string }) {
  const { tx, te } = useI18n();
  const settings = useCollection("settings");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onCount = settings ? ALL_NOTIFICATION_KEYS.filter((k) => settings.notifications[k]).length : 0;

  async function setAll(value: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await updateSettings(token, { notifications: Object.fromEntries(ALL_NOTIFICATION_KEYS.map((k) => [k, value])) });
    } catch (e) {
      setError(te(e, "Algo deu errado."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="cat-form">
      <div className="cat-form__head">
        <h2 className="cat-form__title">
          <img className="admin-title__icon" src={ICONS.notifications} alt="" aria-hidden="true" /> {tx("Notificações")}
        </h2>
        <Toggle
          checked={onCount === ALL_NOTIFICATION_KEYS.length}
          disabled={!settings || busy}
          label={onCount === ALL_NOTIFICATION_KEYS.length ? tx("Todas ligadas") : onCount > 0 ? tx("{n} ligadas", { n: onCount }) : tx("Todas desligadas")}
          onChange={(v) => void setAll(v)}
        />
      </div>
      <p className="cat-hint">{tx("Os avisos saem por SMS e e-mail pelo IPAlpha; os textos são cuidados no portal de desenvolvedores do IPAlpha. Ligue-os aqui ou um a um em Notificações.")}</p>
      {onCount > 0 && onCount < ALL_NOTIFICATION_KEYS.length && (
        <p className="message message--warn">{tx("{on} de {total} notificações ligadas.", { on: onCount, total: ALL_NOTIFICATION_KEYS.length })}</p>
      )}
      {error && <p className="message message--error">{error}</p>}
    </section>
  );
}

function ConfigStep({ token }: { token: string }) {
  const { tx } = useI18n();
  const settings = useCollection("settings");
  const [error] = useState<string | null>(null);

  return (
    <div className="wizard-config">
      <section className="wizard-card">
        <h2 className="wizard-card__title">{tx("⚙️ Configurações importantes")}</h2>
        <p className="admin-intro">
          {tx("As janelas de acesso e de check-in e os avisos. Quem serve em cada papel (organização, saúde, check-in…) é definido no IPAlpha. Cada card salva por si — nada precisa ser preenchido de uma vez.")}
        </p>
        {error && <p className="message message--error">{error}</p>}
      </section>

      <AccessWindowCard token={token} which="staffAccessWindow" />
      <AccessWindowCard token={token} which="parentAccessWindow" />

      {/* the check-in page of the app: janela do check-in, da volta, pontos de encontro e ajudantes */}
      <div className="wizard__page">
        <CheckinSettingsPage token={token} />
      </div>

      <NotificationsGateCard token={token} />
    </div>
  );
}

// ── rooms ───────────────────────────────────────────────────────────────────

function RoomsStep({ token }: { token: string }) {
  const { tx } = useI18n();
  const [sub, setSub] = useState<"list" | "assign">("assign");
  return (
    <section className="wizard-card wizard-card--full">
      <h2 className="wizard-card__title">{tx("🛏️ Organizar os quartos")}</h2>
      <p className="admin-intro">
        {tx("O quadro sugere grupos pelas preferências das crianças; arraste para os quartos e")} <strong>{tx("Concluir")}</strong> {tx("aplica tudo de uma vez.")}
      </p>
      <div className="staff-toolbar__filters" role="tablist" aria-label={tx("Quartos")}>
        <button type="button" role="tab" aria-selected={sub === "assign"} className={`cat-tab ${sub === "assign" ? "cat-tab--active" : ""}`} onClick={() => setSub("assign")}>
          <img className="cat-tab__img" src={ICONS.roomAssign} alt="" aria-hidden="true" /> {tx("Montar")}
        </button>
        <button type="button" role="tab" aria-selected={sub === "list"} className={`cat-tab ${sub === "list" ? "cat-tab--active" : ""}`} onClick={() => setSub("list")}>
          <img className="cat-tab__img" src={ICONS.bed} alt="" aria-hidden="true" /> {tx("Quartos")}
        </button>
      </div>
      {sub === "assign" ? (
        <div className="wizard__page">
          <RoomAssignPage token={token} onBack={() => setSub("list")} />
        </div>
      ) : (
        <div className="wizard__page">
          <BedroomsPage token={token} />
        </div>
      )}
    </section>
  );
}

// ── buses (prefilled from the seeds) ───────────────────────────────────────

function BusesStep({ token, fleet }: { token: string; fleet: SeedBus[] }) {
  const { tx, te } = useI18n();
  const transports = useCollectionOrEmpty("transports");
  const hydrated = useHydrated();
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seeded = useRef(false);

  // a clean camp gets the seeded fleet on entering the step — once, and only after the sync
  useEffect(() => {
    if (seeded.current || !hydrated || seeding) return;
    if (transports.length > 0) {
      seeded.current = true;
      return;
    }
    seeded.current = true;
    setSeeding(true);
    setError(null);
    (async () => {
      try {
        for (const bus of fleet) {
          const input: TransportInput = { kind: "bus", number: bus.number, color: bus.color, capacity: bus.capacity };
          await createTransport(token, input);
        }
      } catch (e) {
        setError(te(e, "Algo deu errado."));
      } finally {
        setSeeding(false);
      }
    })();
  }, [hydrated, transports.length, seeding, token, fleet]);

  return (
    <section className="wizard-card wizard-card--full">
      <h2 className="wizard-card__title">{tx("🚌 Organizar os ônibus")}</h2>
      <p className="admin-intro">
        {transports.length === 0 && seeding === false
          ? tx("A frota foi limpa — cadastre os ônibus (e os carros que trazem crianças) e arraste as turmas.")
          : tx("{n} ônibus coloridos já vieram prontos (edite cores, números e lugares). Arraste a turma de cada líder para o ônibus dela.", { n: fleet.length })}
      </p>
      {error && <p className="message message--error">{error}</p>}
      {seeding ? <p className="opt-empty">{tx("Criando os ônibus… 🚌")}</p> : <div className="wizard__page"><BusAssignPage token={token} /></div>}
    </section>
  );
}

// ── done ────────────────────────────────────────────────────────────────────

function DoneStep({ onExit }: { onExit: () => void }) {
  const { tx } = useI18n();
  const staff = useCollectionOrEmpty("staff");
  const campers = useCollectionOrEmpty("campers");
  const bedrooms = useCollectionOrEmpty("bedrooms");
  const events = useCollectionOrEmpty("events");
  const roles = useCollectionOrEmpty("roles");
  const preparation = useCollectionOrEmpty("preparation");
  const instructions = useCollectionOrEmpty("instructions");
  const transports = useCollectionOrEmpty("transports");
  const settings = useCollection("settings");

  const team = staff.filter((s) => s.active).length;
  const placed = campers.filter((k) => k.transportation).length;
  const rows: { label: string; value: string; ok: boolean }[] = [
    { label: tx("Equipe importada"), value: tx("{n} pessoa(s)", { n: team }), ok: team > 0 },
    { label: tx("Acampantes importados"), value: tx("{n} criança(s)", { n: campers.length }), ok: campers.length > 0 },
    { label: tx("Quartos criados"), value: tx("{n} quarto(s)", { n: bedrooms.length }), ok: bedrooms.length > 0 },
    { label: tx("Programação"), value: tx("{events} evento(s) · {roles} função(ões)", { events: events.length, roles: roles.length }), ok: events.length > 0 },
    { label: tx("Documentos"), value: tx("{prep} preparação(ões) · {instr} instrução(ões)", { prep: preparation.length, instr: instructions.length }), ok: preparation.length > 0 && instructions.length > 0 },
    {
      label: tx("Janelas e listas"),
      value: settings?.checkinWindow.from ? tx("check-in ✓") : tx("check-in —"),
      ok: !!settings?.checkinWindow.from,
    },
    { label: tx("Ônibus"), value: tx("{vehicles} veículo(s) · {placed}/{total} crianças alocadas", { vehicles: transports.length, placed, total: campers.length }), ok: transports.length > 0 },
  ];

  return (
    <section className="wizard-card wizard-card--intro">
      <div className="confetti" aria-hidden="true">🎉 🏕️ ✨ 🌲 🎈</div>
      <h2 className="wizard-card__title">{tx("Tudo pronto! 🎉")}</h2>
      <p className="admin-intro">{tx("Como ficou o acampamento:")}</p>
      <ul className="wizard-summary">
        {rows.map((r) => (
          <li key={r.label} className={r.ok ? "wizard-summary__ok" : ""}>
            <span aria-hidden="true">{r.ok ? "✅" : "•"}</span> <strong>{r.label}:</strong> {r.value}
          </li>
        ))}
      </ul>
      <p className="cat-hint">
        {tx("O que faltou dá para fazer depois nas próprias abas — ou reabrir este assistente em Limpeza / Perfil.")}
      </p>
      <div className="cat-form__actions">
        <button type="button" className="button button--primary" onClick={onExit}>
          {tx("Concluir 🏕️")}
        </button>
      </div>
    </section>
  );
}

// ── shared shell ───────────────────────────────────────────────────────────

function StepShell({ title, hint, children }: { title?: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="wizard-card wizard-card--full">
      {title && <h2 className="wizard-card__title">{title}</h2>}
      {hint && <p className="admin-intro">{hint}</p>}
      <div className="wizard__page">{children}</div>
    </section>
  );
}
