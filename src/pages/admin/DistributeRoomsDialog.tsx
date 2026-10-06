import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Dialog from "../../components/Dialog";
import OptionCards from "../../components/OptionCards";
import Toggle from "../../components/Toggle";
import { GROUP_META, type Bedroom } from "../../api/bedrooms";
import { ageOf, type Camper } from "../../api/campers";
import type { Staff } from "../../api/staff";
import type { KidUnit, PreferenceMap } from "../../roomGroups";
import { STRATEGIES, type AgeSlice, type DistributeWho, type DistributionPlan, type KidsMode } from "../../roomDistribution";
import type { WorkerMessage, WorkerRequest } from "../../roomDistribution.worker";
import { ICONS } from "../../icons";
import { useI18n } from "../../i18n";
import { firstNameOf } from "./staffNames";
import css from "./staffGroup.module.scss";

/** how long the solver keeps trying before it settles for the best plan so far */
const DEADLINE_MS = 10_000;

interface Props {
  open: boolean;
  bedrooms: Bedroom[];
  campers: Camper[];
  staff: Staff[];
  units: KidUnit[];
  prefs: PreferenceMap;
  /** admins + admin lists: never placed in a kids' room */
  excludeStaffIds: ReadonlySet<string>;
  onApply: (plan: DistributionPlan) => void;
  onClose: () => void;
}

type Step = "who" | "mode" | "running" | "result";

/**
 * Distribuir: fills the rooms for the admin. Who → (kids) how → a 10-second
 * search in a worker → what came out (groups kept / broken) → apply to the draft.
 */
export default function DistributeRoomsDialog({ open, bedrooms, campers, staff, units, prefs, excludeStaffIds, onApply, onClose }: Props) {
  const { tx } = useI18n();
  const [step, setStep] = useState<Step>("who");
  const [who, setWho] = useState<DistributeWho>("everyone");
  const [kidsMode, setKidsMode] = useState<KidsMode>("auto");
  // the safe default: never throw away what the admin already placed by hand
  const [keepPlaced, setKeepPlaced] = useState(true);
  /** the one sex + age range the `ages` mode places (null until "Por idade e sexo" is picked) */
  const [slice, setSlice] = useState<AgeSlice | null>(null);
  const [progress, setProgress] = useState<{ best: DistributionPlan; attempts: number } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [plan, setPlan] = useState<DistributionPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const worker = useRef<Worker | null>(null);

  const kidRooms = useMemo(() => bedrooms.filter((b) => b.group !== "staff"), [bedrooms]);
  // birth dates are not served by IPAlpha yet: with no age known, the slice is by sex only (the algorithm stays ready)
  const ages = useMemo(() => campers.map((k) => ageOf(k.birthDate ?? null)).filter((a): a is number => a !== null), [campers]);
  const agesKnown = ages.length > 0;
  const ageMin = ages.length ? Math.min(...ages) : 6;
  const ageMax = ages.length ? Math.max(...ages) : 12;

  useEffect(() => {
    if (!open) {
      worker.current?.terminate();
      worker.current = null;
      setStep("who");
      setPlan(null);
      setProgress(null);
    }
  }, [open]);

  /** Picking "Por idade e sexo" starts with the girls, every age, and no rooms yet — the admin names the rooms */
  function pickMode(mode: KidsMode) {
    setKidsMode(mode);
    if (mode !== "ages" || slice) return;
    // the range starts at the younger half, ready for when the toggle is switched off
    setSlice({ sex: "F", allAges: true, minAge: ageMin, maxAge: Math.max(ageMin, (ageMin + ageMax) >> 1), roomIds: [] });
  }

  function next() {
    if (step === "who") {
      if (who === "staff") run();
      else setStep("mode");
    } else if (step === "mode") run();
  }

  function run() {
    setStep("running");
    setProgress(null);
    setElapsed(0);
    setError(null);
    const w = new Worker(new URL("../../roomDistribution.worker.ts", import.meta.url), { type: "module" });
    worker.current = w;
    const started = Date.now();
    const tick = window.setInterval(() => setElapsed(Date.now() - started), 250);
    const finish = () => {
      window.clearInterval(tick);
      w.terminate();
      worker.current = null;
    };
    const fail = (message: string) => {
      finish();
      setError(message);
      setStep(kidsMode === "ages" || who !== "staff" ? "mode" : "who");
    };
    w.onmessage = (e: MessageEvent<WorkerMessage>) => {
      if (e.data.type === "progress") setProgress({ best: e.data.best, attempts: e.data.attempts });
      else if (e.data.type === "error") {
        // the worker's text is technical (name: message): logged, never shown
        console.warn("room distribution failed", e.data.message);
        fail(tx("A distribuição parou no meio. Tente de novo."));
      }
      else {
        finish();
        setPlan(e.data.best);
        setStep("result");
      }
    };
    // the script itself failed to load / parse (an import that needs `window`, a bad bundle…)
    w.onerror = (ev) => {
      console.warn("room distribution could not start", ev.message);
      fail(tx("A distribuição falhou ao iniciar."));
    };
    w.onmessageerror = () => fail(tx("Não foi possível ler a resposta da distribuição."));
    const req: WorkerRequest = {
      input: { who, kidsMode, slice: kidsMode === "ages" && slice ? (agesKnown ? slice : { ...slice, allAges: true }) : null, bedrooms, campers, staff, units, prefs: [...prefs.entries()], keepPlaced, excludeStaffIds: [...excludeStaffIds] },
      deadlineMs: DEADLINE_MS,
    };
    w.postMessage(req);
  }

  const camperName = (id: string) => firstNameOf(campers.find((k) => k.id === id)?.name);
  const roomName = (id: string | null) => (id ? bedrooms.find((b) => b.id === id)?.name ?? "?" : tx("sem quarto"));

  return (
    <Dialog open={open} onClose={onClose} title={tx("Distribuir nos quartos")} width={620} dismissible={step !== "running"}>
      <div className="cat-form cat-form--plain distribute">
        <h2 className="cat-form__title"><img className="admin-title__icon" src={ICONS.roomAssign} alt="" aria-hidden="true" /> {tx("Distribuir nos quartos")}</h2>
        {error && <p className="message message--error">{error}</p>}

        {step === "who" && (
          <>
            <OptionCards<DistributeWho>
              label={tx("Quem distribuir")}
              row
              value={who}
              onChange={setWho}
              options={[
                { key: "everyone", icon: ICONS.staffPair, title: tx("Todos") },
                { key: "kids", icon: ICONS.camper, title: tx("Só as crianças") },
                { key: "staff", icon: GROUP_META.staff.icon ?? ICONS.staffPair, title: tx("Só a equipe") },
              ]}
            />
            <div className="distribute__keep">
              <OptionCards<"redo" | "keep">
                label={tx("Quem já tem quarto")}
                value={keepPlaced ? "keep" : "redo"}
                onChange={(k) => setKeepPlaced(k === "keep")}
                options={[
                  { key: "keep", icon: ICONS.keepRoom, title: tx("Manter quem já tem quarto"), subtitle: tx("Só preenche as camas vazias; o que você já montou fica.") },
                  { key: "redo", icon: ICONS.createNew, title: tx("Refazer tudo"), subtitle: tx("Tira todo mundo dos quartos e monta do zero.") },
                ]}
              />
            </div>
          </>
        )}

        {step === "mode" && (
          <>
            <OptionCards<KidsMode>
              label={tx("Como escolher os quartos")}
              row
              value={kidsMode}
              onChange={pickMode}
              options={[
                { key: "auto", icon: ICONS.organizer, title: tx("Automático") },
                agesKnown ? { key: "ages", icon: ICONS.ageGroups, title: tx("Por idade e sexo") } : { key: "ages", icon: ICONS.ageGroups, title: tx("Por sexo"), subtitle: tx("As idades virão do IPAlpha quando estiverem disponíveis.") },
              ]}
            />
            {kidsMode === "ages" && slice && <AgeSliceEditor slice={agesKnown ? slice : { ...slice, allAges: true }} onChange={setSlice} rooms={kidRooms} campers={campers} ageMin={ageMin} ageMax={ageMax} agesKnown={agesKnown} />}
          </>
        )}

        {step === "running" && (
          <div className="distribute__running">
            <div className="import-progress" aria-label={tx("Procurando a melhor distribuição")}>
              <span style={{ width: `${Math.min(100, (elapsed / DEADLINE_MS) * 100)}%` }} />
            </div>
            <p className="admin-intro">
              {progress
                ? <>{tx("Testando {n} estratégias… {attempts} tentativas · melhor até agora:", { n: STRATEGIES.length, attempts: progress.attempts })} <strong>{progress.best.score.brokenGroups}</strong> {tx("grupo(s) separado(s)")}</>
                : tx("Testando {n} estratégias… começando", { n: STRATEGIES.length })}
            </p>
            <p className="cat-hint">{tx("Para assim que achar uma distribuição sem grupos separados, ou em {seconds} s.", { seconds: DEADLINE_MS / 1000 })}</p>
          </div>
        )}

        {step === "result" && plan && (
          <div className="distribute__result">
            <div className="import-stats">
              <span className="import-stats__success"><b>{plan.groups.filter((g) => g.memberIds.length > 1 && !g.movedIds.length).length}</b> {tx("grupos inteiros")}</span>
              <span className={plan.score.brokenGroups ? "import-stats__warning" : "import-stats__success"}><b>{plan.score.brokenGroups}</b> {tx("separados")}</span>
              {plan.score.unplaced > 0 && <span className="import-stats__warning"><b>{plan.score.unplaced}</b> {tx("sem quarto")}</span>}
              {plan.score.leaderless > 0 && <span className="import-stats__warning"><b>{plan.score.leaderless}</b> {tx("quartos sem líder")}</span>}
              {plan.score.overflow > 0 && <span className="import-stats__warning"><b>{plan.score.overflow}</b> {tx("acima da lotação")}</span>}
              {plan.score.ageMixed > 0 && <span className="import-stats__warning"><b>{plan.score.ageMixed}</b> {tx("quartos com idades misturadas")}</span>}
            </div>
            {plan.score.brokenGroups > 0 && (
              <ul className="distribute__broken">
                {plan.groups.filter((g) => g.movedIds.length > 0).map((g) => (
                  <li key={g.unitId}>
                    <strong>{roomName(g.roomId)}</strong>: {g.memberIds.filter((id) => !g.movedIds.includes(id)).map(camperName).join(", ")}
                    <span className="distribute__moved"> · {tx("saíram: {list}", { list: g.movedIds.map((id) => `${camperName(id)} → ${roomName(plan.campers[id]?.bedroom ?? null)}`).join(", ") })}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="cat-hint">{tx("Nada foi gravado: a distribuição entra no rascunho e você ajusta antes de Salvar. Os grupos separados ficam marcados no quadro.")}</p>
          </div>
        )}

        <div className="cat-form__actions">
          {/* a step with a way back has no Cancelar: Voltar is the way out of it, the dialog's × / Esc closes everything */}
          {step === "mode" && <button type="button" className="link-btn cat-form__back" onClick={() => setStep("who")}>{tx("Voltar")}</button>}
          {step === "result" && <button type="button" className="link-btn cat-form__back" onClick={() => setStep("who")}>{tx("Tentar de novo")}</button>}
          {step === "who" && <button type="button" className="button button--secondary" onClick={onClose}>{tx("Cancelar")}</button>}
          {step !== "running" && step !== "result" && (() => {
            // the age inputs are free: an age younger/older than any camper is a valid (possibly empty) slice,
            // it must never disable the button
            const agesOk =
              kidsMode !== "ages" ||
              !!slice?.allAges ||
              (slice != null && Number.isFinite(slice.minAge) && Number.isFinite(slice.maxAge) && slice.minAge <= slice.maxAge);
            const blocked = step === "mode" && kidsMode === "ages" && (!slice?.roomIds.length || !agesOk);
            return (
              <button type="button" className="button button--primary" disabled={blocked} onClick={next}>
                {step === "who" && who === "staff" ? tx("Distribuir") : step === "mode" ? tx("Distribuir") : tx("Continuar")}
              </button>
            );
          })()}
          {step === "result" && plan && <button type="button" className="button button--primary" onClick={() => onApply(plan)}>{tx("Aplicar no rascunho")}</button>}
        </div>
      </div>
    </Dialog>
  );
}

/** One slice, top to bottom: the sex → the age range → the rooms of that wing to fill. Nobody outside the slice is touched. */
function AgeSliceEditor({ slice, onChange, rooms, campers, ageMin, ageMax, agesKnown }: { slice: AgeSlice; onChange: (s: AgeSlice) => void; rooms: Bedroom[]; campers: Camper[]; ageMin: number; ageMax: number; agesKnown: boolean }) {
  const { tx } = useI18n();
  const wing = slice.sex === "F" ? "girls" : "boys";
  const wingRooms = rooms.filter((r) => r.group === wing);
  // switching sex drops the rooms: they belonged to the other wing
  const setSex = (sex: "F" | "M") => onChange({ ...slice, sex, roomIds: [] });
  // `allAges` is explicit state, never derived from the numbers: typing "8" then "5" must not
  // flip the toggle and hide the field under the cursor halfway through
  const { allAges } = slice;

  const setRooms = (ids: Iterable<string>) => {
    const keep = new Set(ids);
    onChange({ ...slice, roomIds: wingRooms.map((r) => r.id).filter((id) => keep.has(id)) });
  };
  const toggleRoom = (id: string) => setRooms(slice.roomIds.includes(id) ? slice.roomIds.filter((r) => r !== id) : [...slice.roomIds, id]);

  // ── Finder-style selection: a rubber band drawn on the AREA picks the chips it touches;
  //    a tap on a chip toggles it; a tap on empty area clears everything ──
  const area = useRef<HTMLDivElement>(null);
  /** the rubber band in flight (viewport coordinates) */
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  /** every room chip whose box the band touches */
  const roomsInRect = (x0: number, y0: number, x1: number, y1: number): string[] => {
    const [left, right] = [Math.min(x0, x1), Math.max(x0, x1)];
    const [top, bottom] = [Math.min(y0, y1), Math.max(y0, y1)];
    const hits: string[] = [];
    area.current?.querySelectorAll<HTMLElement>("[data-room]").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.left <= right && r.right >= left && r.top <= bottom && r.bottom >= top) hits.push(el.dataset.room!);
    });
    return hits;
  };
  const areaPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if ((e.target as HTMLElement).closest("[data-room]")) return; // chips handle their own tap
    e.preventDefault(); // otherwise the browser starts a native text selection and eats the moves
    const startX = e.clientX, startY = e.clientY;
    // shift/cmd keeps what was already picked, like Finder
    const base = e.shiftKey || e.metaKey || e.ctrlKey ? slice.roomIds : [];
    let active = false;
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", end);
      setMarquee(null);
    };
    const move = (ev: PointerEvent) => {
      if (!active) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
        active = true;
      }
      setMarquee({ x0: startX, y0: startY, x1: ev.clientX, y1: ev.clientY });
      setRooms([...base, ...roomsInRect(startX, startY, ev.clientX, ev.clientY)]);
    };
    const up = () => {
      const wasDrag = active;
      end();
      if (!wasDrag && !base.length) setRooms([]); // plain click on empty area: clear
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", end);
  };
  const agesReady = allAges || (Number.isFinite(slice.minAge) && Number.isFinite(slice.maxAge));
  const count = agesReady
    ? campers.filter((k) => {
        if (k.sex !== slice.sex) return false;
        if (allAges) return true;
        const a = ageOf(k.birthDate ?? null);
        return a !== null && a >= slice.minAge && a <= slice.maxAge;
      }).length
    : 0;
  const beds = wingRooms.filter((r) => slice.roomIds.includes(r.id)).reduce((n, r) => n + Math.max(0, r.capacity - 2), 0);
  return (
    <div className="distribute__slice">
      <OptionCards<"F" | "M">
        label={tx("Sexo")}
        row
        value={slice.sex}
        onChange={setSex}
        options={[
          { key: "F", icon: ICONS.girlFace, title: tx("Meninas") },
          { key: "M", icon: ICONS.boyFace, title: tx("Meninos") },
        ]}
      />
      <div className="distribute__band-ages">
        {agesKnown && <Toggle checked={allAges} onChange={(on) => onChange({ ...slice, allAges: on })} label={tx("Todas as idades")} />}
        {agesKnown && !allAges && (
          <>
            <span>{tx("De")}</span>
            <input
              className="cat-input"
              type="number"
              min={ageMin}
              max={ageMax}
              value={Number.isFinite(slice.minAge) ? slice.minAge : ""}
              onChange={(e) => {
                const raw = e.target.value;
                onChange({ ...slice, minAge: raw === "" ? Number.NaN : Number(raw) });
              }}
              aria-label={tx("Idade mínima")}
            />
            <span>{tx("a")}</span>
            <input
              className="cat-input"
              type="number"
              min={ageMin}
              max={ageMax}
              value={Number.isFinite(slice.maxAge) ? slice.maxAge : ""}
              onChange={(e) => {
                const raw = e.target.value;
                onChange({ ...slice, maxAge: raw === "" ? Number.NaN : Number(raw) });
              }}
              aria-label={tx("Idade máxima")}
            />
            <span>{tx("anos")}</span>
          </>
        )}
        <em className="distribute__slice-count">{count} {count === 1 ? tx("criança") : tx("crianças")}</em>
      </div>
      {!agesKnown && <p className={`cat-hint ${css.agesHint}`}>{tx("As idades ainda não vêm do IPAlpha: por enquanto a distribuição usa o sexo e as preferências de quarto. Quando estiverem disponíveis, dá para separar por idade aqui.")}</p>}
      <div ref={area} className="chip-group distribute__rooms" onPointerDown={areaPointerDown} title={tx("Arraste na área para selecionar vários quartos")}>
        {wingRooms.map((r) => {
          const on = slice.roomIds.includes(r.id);
          return (
            <button key={r.id} type="button" data-room={r.id} className={`chip-toggle chip-toggle--small ${on ? "chip-toggle--on" : ""}`} aria-pressed={on} onClick={() => toggleRoom(r.id)}>
              {r.name} <span className="cat-tab__count">{r.capacity}</span>
            </button>
          );
        })}
        {wingRooms.length === 0 && <p className="cat-hint">{tx("Nenhum quarto nesta ala.")}</p>}
      </div>
      {marquee && createPortal(
        <div className="bus-marquee" style={{ left: Math.min(marquee.x0, marquee.x1), top: Math.min(marquee.y0, marquee.y1), width: Math.abs(marquee.x1 - marquee.x0), height: Math.abs(marquee.y1 - marquee.y0) }} aria-hidden="true" />,
        document.body,
      )}
      {/* always rendered, so the dialog keeps its height whether or not there is something to say */}
      <p className={`cat-hint distribute__fit${beds < count && slice.roomIds.length ? " cat-hint--error" : ""}`} aria-live="polite">
        {slice.roomIds.length > 0 ? <>{beds} {tx("camas de criança")} {beds < count ? tx("— não cabem todas") : tx("— cabem")}</> : "\u00a0"}
      </p>
    </div>
  );
}
