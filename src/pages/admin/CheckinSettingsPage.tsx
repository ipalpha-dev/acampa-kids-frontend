import { useEffect, useState } from "react";
import { DEFAULT_CHECKIN_LOCATION, mapsLink, resetCheckins, updateSettings, type BusHelper, type CheckinLocation, type Settings } from "../../api/settings";
import { useCollection } from "../../store";
import { useConfirm } from "../../components/ConfirmDialog";
import SpotMap from "../../components/SpotMap";
import BusHelpersEditor from "./BusHelpersEditor";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { speakWhen } from "../../dates";
import { ICONS } from "../../icons";
import { useI18n } from "../../i18n";

interface CheckinSettingsPageProps {
  token: string;
}

const RADIUS_MIN = 50;
const RADIUS_MAX = 5000;

/** one meeting point as typed in the form (strings, so half-typed numbers survive) */
interface SpotDraft {
  id: string;
  name: string;
  lat: string;
  lng: string;
  radius: string;
}
const toDraft = (l: CheckinLocation): SpotDraft => ({ id: l.id, name: l.name, lat: String(l.lat), lng: String(l.lng), radius: String(l.radiusM) });
const num = (v: string) => Number(v.replace(",", "."));
/** parsed + validated; null when some field is invalid */
function parseSpot(d: SpotDraft): CheckinLocation | null {
  const lat = num(d.lat);
  const lng = num(d.lng);
  const radiusM = Number(d.radius);
  const name = d.name.trim();
  if (!name || d.lat.trim() === "" || d.lng.trim() === "") return null;
  if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lng) || Math.abs(lng) > 180) return null;
  if (!Number.isFinite(radiusM) || radiusM < RADIUS_MIN || radiusM > RADIUS_MAX) return null;
  return { id: d.id, name, lat, lng, radiusM: Math.round(radiusM) };
}
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `spot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

/** ISO instant → value for <input type="datetime-local"> (device clock) */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local value → ISO instant (device clock), or null when empty */
function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** compare instants at minute precision (datetime-local can't carry seconds) */
const sameMinute = (a: string | null, b: string | null) => (a ? Math.floor(new Date(a).getTime() / 60_000) : null) === (b ? Math.floor(new Date(b).getTime() / 60_000) : null);
/**
 * Admin-only: everything about departure-day check-in, on one page.
 *
 *   1. the time WINDOW in which the team's helpers may act (church and bus
 *      share it) — outside it the server sends them nothing extra;
 *   2. who helps with the CHURCH check-in of the kids (they receive every
 *      camper, health included, to confirm with the parents);
 *   3. who helps with the BUS roll call: one list PER VEHICLE — the person
 *      stands at that vehicle's door (they need not ride in it) and only gets
 *      its kids, names only;
 *   4. the meeting points (church, camp site…) + radius for the team's own "Cheguei!" — the nearest one wins;
 *   5. a shortcut to zero every check-in (also on Testes).
 *
 * Each section saves on its own, so a change in one never touches the others.
 */
export default function CheckinSettingsPage({ token }: CheckinSettingsPageProps) {
  const { tx, te } = useI18n();
  const settings = useCollection("settings");
  /** phones: the "new meeting point" button shrinks to a bare ➕ */
  const phone = useMediaQuery("(max-width: 760px)");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  // section drafts
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [returnFrom, setReturnFrom] = useState("");
  const [returnUntil, setReturnUntil] = useState("");
  const [bus, setBus] = useState<BusHelper[]>([]);
  const [spots, setSpots] = useState<SpotDraft[]>([]);
  const confirm = useConfirm();
  const campers = useCollection("campers");
  const staff = useCollection("staff");

  function fill(s: Settings) {
    setFrom(toLocalInput(s.checkinWindow.from));
    setUntil(toLocalInput(s.checkinWindow.until));
    setReturnFrom(toLocalInput(s.busReturnWindow?.from ?? null));
    setReturnUntil(toLocalInput(s.busReturnWindow?.until ?? null));
    setBus(s.busHelpers.helpers);
    setSpots(s.checkinLocations.map(toDraft));
  }

  useEffect(() => {
    if (settings) fill(settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  /** Saves the time/location forms and refreshes their drafts after success. */
  async function save(section: string, patch: Parameters<typeof updateSettings>[1]) {
    if (busy) return;
    setBusy(section);
    setError(null);
    setSaved(null);
    try {
      await updateSettings(token, patch);
      setSaved(section);
    } catch (err) {
      setError(te(err, "Algo deu errado."));
    } finally {
      setBusy(null);
    }
  }

  /** The bus helpers' vehicles save immediately when a person is added, removed or reassigned. */
  async function saveBus(nextHelpers: BusHelper[]) {
    if (busy) return;
    const previous = bus;
    setBus(nextHelpers);
    setBusy("bus");
    setError(null);
    try {
      await updateSettings(token, { busHelpers: { helpers: nextHelpers } });
    } catch (err) {
      setBus(previous);
      setError(te(err, "Algo deu errado."));
    } finally {
      setBusy(null);
    }
  }

  if (!settings && !error) {
    return (
      <div className="admin-page">
        <p className="opt-empty">{tx("Carregando configurações… ⚙️")}</p>
      </div>
    );
  }

  // ── window ──
  const fromIso = fromLocalInput(from);
  const untilIso = fromLocalInput(until);
  const orderOk = !fromIso || !untilIso || new Date(fromIso) < new Date(untilIso);
  const windowComplete = !!fromIso && !!untilIso;
  const windowDirty = !!settings && (!sameMinute(fromIso, settings.checkinWindow.from) || !sameMinute(untilIso, settings.checkinWindow.until));
  const now = Date.now();
  const openNow = windowComplete && orderOk && new Date(fromIso!).getTime() <= now && now < new Date(untilIso!).getTime();
  const testMode = !!settings?.checkinTestMode;

  // ── return bus window ──
  const returnFromIso = fromLocalInput(returnFrom);
  const returnUntilIso = fromLocalInput(returnUntil);
  const returnOrderOk = !returnFromIso || !returnUntilIso || new Date(returnFromIso) < new Date(returnUntilIso);
  const returnComplete = !!returnFromIso && !!returnUntilIso;
  const returnDirty = !!settings && (!sameMinute(returnFromIso, settings.busReturnWindow?.from ?? null) || !sameMinute(returnUntilIso, settings.busReturnWindow?.until ?? null));
  const returnOpenNow = returnComplete && returnOrderOk && new Date(returnFromIso!).getTime() <= now && now < new Date(returnUntilIso!).getTime();

  // ── meeting points ──
  const parsedSpots = spots.map(parseSpot);
  const spotsValid = spots.length > 0 && parsedSpots.every((p) => p !== null);
  const spotsDirty = !!settings && JSON.stringify(parsedSpots) !== JSON.stringify(settings.checkinLocations);
  const patchSpot = (id: string, patch: Partial<SpotDraft>) => setSpots((list) => list.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  const addSpot = () => setSpots((list) => [...list, { id: newId(), name: "", lat: "", lng: "", radius: String(DEFAULT_CHECKIN_LOCATION.radiusM) }]);
  const removeSpot = (id: string) => setSpots((list) => list.filter((d) => d.id !== id));

  /** "-23.480536, -46.830779" pasted from Google Maps → fills both fields */
  function handleLatPaste(id: string, e: React.ClipboardEvent<HTMLInputElement>) {
    const m = e.clipboardData.getData("text").match(/^\s*(-?\d+(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d+(?:[.,]\d+)?)\s*$/);
    if (!m) return;
    e.preventDefault();
    patchSpot(id, { lat: m[1].replace(",", "."), lng: m[2].replace(",", ".") });
  }

  const kidsChecked = campers?.filter((k) => k.checkin || k.busCheckin || k.busReturnCheckin).length ?? 0;
  const staffChecked = staff?.filter((s) => s.checkin).length ?? 0;
  async function reset() {
    if (busy) return;
    const okReset = await confirm({
      emoji: "🧹",
      title: tx("Zerar todos os check-ins?"),
      message: tx("Isso apaga o check-in de {kids} criança(s) e {staff} pessoa(s) da equipe, os coletes e o histórico. Não pode ser desfeito.", { kids: kidsChecked, staff: staffChecked }),
      confirmLabel: tx("Zerar check-ins"),
      danger: true,
    });
    if (!okReset) return;
    setBusy("reset");
    setError(null);
    setSaved(null);
    try {
      await resetCheckins(token);
      setSaved("reset");
    } catch (e) {
      setError(te(e, "Algo deu errado."));
    } finally {
      setBusy(null);
    }
  }

  const ok = (section: string, text: string) => saved === section && <p className="message message--ok">✅ {text}</p>;

  return (
    <div className="admin-page">
      <header className="admin-head">
        <h1 className="admin-title">✅ {tx("Check-in")}</h1>
      </header>
      {error && <p className="message message--error">{error}</p>}

      {/* ── 1. window ── */}
      <form
        className="cat-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (orderOk) void save("window", { checkinWindow: { from: fromIso, until: untilIso } });
        }}
      >
        <h2 className="cat-form__title">{tx("⏰ Janela de horário do check-in")}</h2>
        <p className="cat-hint">
          {tx("Nesse horário os ajudantes da igreja")} <strong>{tx("e")}</strong>{tx(" do ônibus recebem os dados das crianças e fazem o check-in.")}
        </p>
        <div className="cat-form__row staff-form__row">
          <label className="cat-field cat-field--grow">
            <span className="cat-field__label">{tx("Abre em")}</span>
            <input className="cat-input" type="datetime-local" value={from} disabled={!!busy} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="cat-field cat-field--grow">
            <span className="cat-field__label">{tx("Fecha em")}</span>
            <input className="cat-input" type="datetime-local" value={until} disabled={!!busy} onChange={(e) => setUntil(e.target.value)} />
          </label>
        </div>
        {testMode && <p className="cat-hint">{tx("🧪 Modo de teste ligado — igreja e ônibus estão liberados agora, independente da janela.")}</p>}
        {!orderOk ? (
          <p className="cat-hint cat-hint--error">{tx("O fim da janela precisa ser depois do início.")}</p>
        ) : windowComplete ? (
          <p className="cat-hint">
            {openNow
              ? tx("🟢 Aberta agora — fecha {when}", { when: speakWhen(untilIso!) })
              : new Date(fromIso!).getTime() > now
                ? tx("🕒 Abre {from} até {until}", { from: speakWhen(fromIso!), until: speakWhen(untilIso!) })
                : tx("⚫ Fechada — era {from} até {until}", { from: speakWhen(fromIso!), until: speakWhen(untilIso!) })}
            .
          </p>
        ) : null}
        {ok("window", openNow ? tx("Janela salva — está aberta agora.") : tx("Janela salva."))}
        <div className="cat-form__actions">
          <button type="submit" className="button button--primary" disabled={!orderOk || !windowDirty || !!busy}>
            {busy === "window" ? tx("Salvando…") : tx("Salvar horário ⏰")}
          </button>
        </div>
      </form>

      {/* ── return trip window ── */}
      <form
        className="cat-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (returnOrderOk) void save("return-window", { busReturnWindow: { from: returnFromIso, until: returnUntilIso } });
        }}
      >
        <h2 className="cat-form__title">
          <img className="admin-title__icon" src={ICONS.transport} alt="" aria-hidden="true" /> {tx("Janela da volta para a igreja")}
        </h2>
        <p className="cat-hint">{tx("Horário em que os ajudantes fazem a chamada no ônibus antes de sair do acampamento.")}</p>
        <div className="cat-form__row staff-form__row">
          <label className="cat-field cat-field--grow">
            <span className="cat-field__label">{tx("Abre em")}</span>
            <input className="cat-input" type="datetime-local" value={returnFrom} disabled={!!busy} onChange={(e) => setReturnFrom(e.target.value)} />
          </label>
          <label className="cat-field cat-field--grow">
            <span className="cat-field__label">{tx("Fecha em")}</span>
            <input className="cat-input" type="datetime-local" value={returnUntil} disabled={!!busy} onChange={(e) => setReturnUntil(e.target.value)} />
          </label>
        </div>
        {!returnOrderOk ? (
          <p className="cat-hint cat-hint--error">{tx("O fim da janela precisa ser depois do início.")}</p>
        ) : returnComplete ? (
          <p className="cat-hint">
            {returnOpenNow
              ? tx("🟢 Aberta agora — fecha {when}", { when: speakWhen(returnUntilIso!) })
              : new Date(returnFromIso!).getTime() > now
                ? tx("🕒 Abre {from} até {until}", { from: speakWhen(returnFromIso!), until: speakWhen(returnUntilIso!) })
                : tx("⚫ Fechada — era {from} até {until}", { from: speakWhen(returnFromIso!), until: speakWhen(returnUntilIso!) })}.
          </p>
        ) : null}
        {ok("return-window", returnOpenNow ? tx("Janela da volta salva — está aberta agora.") : tx("Janela da volta salva."))}
        <div className="cat-form__actions">
          <button type="submit" className="button button--primary" disabled={!returnOrderOk || !returnDirty || !!busy}>
            {busy === "return-window" ? tx("Salvando…") : tx("Salvar volta")}
          </button>
        </div>
      </form>

      {/* ── 2. church helpers: the `checkin` role in IPAlpha ── */}
      <section className="cat-form">
        <h2 className="cat-form__title">{tx("⛪ Ajudantes do check-in na igreja")}</h2>
        <p className="cat-hint">
          {tx("Quem ajuda no check-in é quem tem o papel “Check-in na igreja” no IPAlpha (Oikos → Projetos → Acampa Kids). Durante a janela, essas pessoas veem todas as crianças.")}
        </p>
      </section>

      {/* ── 3. bus helpers ── */}
      <section className="cat-form">
        <BusHelpersEditor value={bus} onChange={(helpers) => void saveBus(helpers)} disabled={!!busy} />
      </section>

      {/* ── 4. meeting points ── */}
      <form
        className="cat-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (spotsValid) void save("location", { checkinLocations: parsedSpots as CheckinLocation[] });
        }}
      >
        <div className="list-head">
          <h2 className="cat-form__title">{tx("📍 Pontos de encontro da equipe")}</h2>
          <button type="button" className="button button--secondary list-head__add" disabled={!!busy} onClick={addSpot} title={tx("Novo ponto")} aria-label={tx("Novo ponto")}>
            {phone ? "➕" : tx("➕ Novo ponto")}
          </button>
        </div>
        <p className="cat-hint">
          {tx("Cada pessoa da equipe faz o")} <strong>{tx("próprio check-in")}</strong>{tx(" pelo celular ao chegar em um destes pontos (a igreja, o acampamento para quem vai direto…), dentro do raio.")}
        </p>

        {spots.map((d, i) => {
          const parsed = parsedSpots[i];
          const latN = num(d.lat);
          const lngN = num(d.lng);
          const radiusN = Number(d.radius);
          const latOk = d.lat.trim() !== "" && Number.isFinite(latN) && Math.abs(latN) <= 90;
          const lngOk = d.lng.trim() !== "" && Number.isFinite(lngN) && Math.abs(lngN) <= 180;
          const radiusOk = Number.isFinite(radiusN) && radiusN >= RADIUS_MIN && radiusN <= RADIUS_MAX;
          const mappable = latOk && lngOk;
          return (
            <div key={d.id} className="spot-card">
              {mappable && (
                <SpotMap lat={latN} lng={lngN} radiusM={radiusOk ? Math.round(radiusN) : DEFAULT_CHECKIN_LOCATION.radiusM} onMove={(p) => patchSpot(d.id, { lat: String(p.lat), lng: String(p.lng) })} />
              )}
              <div className="cat-form__row staff-form__row">
                <label className="cat-field cat-field--grow">
                  <span className="cat-field__label">{tx("Nome")}</span>
                  <input className="cat-input" placeholder={tx("Igreja, Acampamento…")} maxLength={60} value={d.name} disabled={!!busy} onChange={(e) => patchSpot(d.id, { name: e.target.value })} />
                </label>
                <label className="cat-field spot-card__radius">
                  <span className="cat-field__label">{tx("Raio (metros)")}</span>
                  <input className="cat-input" type="number" inputMode="numeric" min={RADIUS_MIN} max={RADIUS_MAX} step={10} value={d.radius} disabled={!!busy} onChange={(e) => patchSpot(d.id, { radius: e.target.value })} />
                </label>
              </div>
              <div className="cat-form__row staff-form__row">
                <label className="cat-field cat-field--grow">
                  <span className="cat-field__label">{tx("Latitude")}</span>
                  <input className="cat-input" inputMode="decimal" placeholder="-23.480536" value={d.lat} disabled={!!busy} onChange={(e) => patchSpot(d.id, { lat: e.target.value })} onPaste={(e) => handleLatPaste(d.id, e)} />
                </label>
                <label className="cat-field cat-field--grow">
                  <span className="cat-field__label">{tx("Longitude")}</span>
                  <input className="cat-input" inputMode="decimal" placeholder="-46.830779" value={d.lng} disabled={!!busy} onChange={(e) => patchSpot(d.id, { lng: e.target.value })} />
                </label>
              </div>
              {!d.name.trim() ? (
                <p className="cat-hint cat-hint--error">{tx("Dê um nome ao ponto.")}</p>
              ) : (d.lat.trim() !== "" && !latOk) || (d.lng.trim() !== "" && !lngOk) ? (
                <p className="cat-hint cat-hint--error">{tx("Latitude entre -90 e 90, longitude entre -180 e 180.")}</p>
              ) : !radiusOk ? (
                <p className="cat-hint cat-hint--error">{tx("O raio precisa estar entre {min} e {max} metros.", { min: RADIUS_MIN, max: RADIUS_MAX })}</p>
              ) : !parsed ? (
                <p className="cat-hint cat-hint--error">{tx("Informe latitude e longitude.")}</p>
              ) : null}
              <div className="settings-tools">
                {mappable && (
                  <a className="button button--secondary spot-card__maps" href={mapsLink({ lat: latN, lng: lngN })} target="_blank" rel="noreferrer">
                    {/* the Google “G” brand mark */}
                    <svg className="spot-card__maps-g" viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
                      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.57 5.57 0 0 1-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" />
                      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24z" />
                      <path fill="#FBBC05" d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.29a12 12 0 0 0 0 10.76l3.98-3.09z" />
                      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42A11.97 11.97 0 0 0 12 0 11.99 11.99 0 0 0 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z" />
                    </svg>
                    {tx("Abrir no Google Maps")}
                  </a>
                )}
                {spots.length > 1 && (
                  <button type="button" className="button button--secondary" disabled={!!busy} onClick={() => removeSpot(d.id)}>
                    {tx("🗑️ Remover ponto")}
                  </button>
                )}
              </div>
            </div>
          );
        })}

        <p className="cat-hint">
          {tx("Dica: no Google Maps, clique com o botão direito no local e copie as coordenadas (dá para colar as duas de uma vez no campo Latitude), ou arraste o 📍 no mapa. 200–500 m é um bom raio.")}
        </p>
        {!spots.some((d) => d.id === DEFAULT_CHECKIN_LOCATION.id) && (
          <div className="settings-tools">
            <button type="button" className="button button--secondary" disabled={!!busy} title="Igreja Presbiteriana em Alphaville" onClick={() => setSpots((list) => [toDraft(DEFAULT_CHECKIN_LOCATION), ...list])}>
              {tx("↺ Adicionar padrão (IPAlpha Tamboré)")}
            </button>
          </div>
        )}
        {ok("location", tx("Pontos salvos! A equipe já pode usar no dia da saída."))}
        <div className="cat-form__actions">
          <button type="submit" className="button button--primary" disabled={!spotsValid || !spotsDirty || !!busy}>
            {busy === "location" ? tx("Salvando…") : tx("Salvar pontos 📍")}
          </button>
        </div>
      </form>

      {/* ── 5. reset (only once someone is checked in) ── */}
      {kidsChecked + staffChecked > 0 && (
      <section className="cat-form">
        <h2 className="cat-form__title">{tx("🧹 Zerar check-ins")}</h2>
        <p className="cat-hint">{tx("Apaga o check-in de todas as crianças (igreja, ida e volta), da equipe, os coletes e o histórico.")}</p>
        {ok("reset", tx("Check-ins zerados."))}
        <div className="settings-tools">
          <button type="button" className="button button--danger" disabled={!!busy} onClick={() => void reset()}>
            {busy === "reset" ? tx("Zerando…") : tx("🧹 Zerar check-ins ({kids} crianças · {staff} equipe)", { kids: kidsChecked, staff: staffChecked })}
          </button>
        </div>
      </section>
      )}
    </div>
  );
}
