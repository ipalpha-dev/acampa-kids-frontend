import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CheckGlyph, UndoGlyph } from "./Glyph";
import SearchField from "./SearchField";
import { giveMedication, SOS_SLOT, undoMedication, type MedicationDose } from "../api/medications";
import { bedroomLabel, type Bedroom } from "../api/bedrooms";
import BedIcon from "./BedIcon";
import CamperPeekDialog from "./CamperPeekDialog";
import OpsFamilyContact from "./OpsFamilyContact";
import { useNames } from "../store/people";
import { useHealthLabel } from "../hooks/usePersonData";
import type { HealthInfo } from "../api/campers";
import { ICONS } from "../icons";
import { minutesOf, nowTime, slotParts, useMedicationDay, type MedEntry } from "../hooks/useMedicationDay";
import { useDoseGrace } from "../hooks/useDoseGrace";
import { speakStamp, todayIso } from "../dates";
import { useCollectionOrEmpty } from "../store";
import { navigate } from "../router";
import { useI18n } from "../i18n";

interface MedicationChecklistProps {
  token: string;
  /** "YYYY-MM-DD" — the day being checked (today on the medical team's Início) */
  day: string;
  /**
   * "page" — the Medicações tab: search, the "Só o que falta" filter, and the
   * "quando necessário" block.
   * "card" — one grouped card on the medical team's Início: only what is still
   * to be given today, no search, no filter, no "quando necessário".
   */
  variant?: "page" | "card";
  /** card variant only: the heading shown with the progress chip in the corner */
  title?: ReactNode;
  /** epoch ms used as "now" for the current-slot highlight (default: the real clock) */
  now?: number;
  /** page variant only: seeds the search box (default: empty, everyone) */
  initialSearch?: string;
}

/** how long a row that moved to the end of its round stays highlighted */
const ARRIVE_MS = 600;

/**
 * The medication checklist of ONE day: the moments of the day with the kids
 * due then, "quando necessário" and the medicines with no schedule yet.
 *
 * Shared by the Medicações tab and the medical team's Início so ticking a dose
 * works and looks the same in both places — only what does not belong on a
 * summary card is dropped there (see `variant`). The day picker (other days)
 * lives on the tab only; here the day arrives as a prop.
 *
 * A ticked row is saved at once (who ticked it and when, visible on every
 * device) and then holds its place for a few seconds offering "Desfazer":
 * while the list is showing only what is missing it fades away afterwards; on
 * the full list it instead sinks to the end of its round, so the pending kids
 * are always the ones at the top.
 */
export default function MedicationChecklist({ token, day, variant = "page", title, now, initialSearch = "" }: MedicationChecklistProps) {
  const { tx } = useI18n();
  const bedrooms = useCollectionOrEmpty("bedrooms");
  /**
   * the kid opened in the popup — the list (and the search) stay exactly as
   * they were. The prescription's health (allergies, drug allergies,
   * conditions — read live for the care team) goes with it.
   */
  const [peek, setPeek] = useState<{ id: string; name: string; health: HealthInfo } | null>(null);
  /** church health option id → label, for the drug-allergy flag */
  const healthLabel = useHealthLabel(token);
  const [search, setSearch] = useState(initialSearch);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  /** hide what is already done, so only what is still missing stays on screen */
  const [onlyMissing, setOnlyMissing] = useState(false);
  /** a row just ticked: stays put for a few seconds (undoable), then fades out / sinks */
  const { grace, leaving, start, forget } = useDoseGrace();

  const card = variant === "card";
  /** the card only ever lists what is still to be given */
  const hideDone = card || onlyMissing;

  /** room of a kid, for the chip beside the name */
  const roomOf = useMemo(() => {
    const map = new Map(bedrooms.map((b) => [b.id, b]));
    return (id: string | null) => (id ? (map.get(id) ?? null) : null);
  }, [bedrooms]);

  /** every prescribed line of the day + the ticks already made */
  const { slots, sos, unscheduled, kidsWithMeds, given: givenToday, sosGiven: sosToday, doneCount, total, loading } = useMedicationDay(token, day, card ? "" : search);

  /** who gave each dose (person ids — names read live) */
  const doses = useCollectionOrEmpty("medications");
  const nameOf = useNames(doses.filter((d) => d.day === day).map((d) => d.byPersonId));
  const firstOf = (id: string) => nameOf(id).split(" ")[0] || "…";

  /** rows that just reached the end of their round: highlighted briefly so the move is followed by the eye */
  const [arriving, setArriving] = useState<Set<string>>(new Set());
  const prevGrace = useRef(grace);
  const arriveTimers = useRef<number[]>([]);
  useEffect(() => {
    const landed = [...prevGrace.current].filter((k) => !grace.has(k) && givenToday.has(k));
    prevGrace.current = grace;
    if (hideDone || landed.length === 0) return;
    setArriving((a) => new Set([...a, ...landed]));
    // self-clearing: the highlight must end even if the list re-renders meanwhile
    arriveTimers.current.push(
      window.setTimeout(
        () =>
          setArriving((a) => {
            const n = new Set(a);
            for (const k of landed) n.delete(k);
            return n;
          }),
        ARRIVE_MS,
      ),
    );
  }, [grace, givenToday, hideDone]);
  useEffect(() => {
    const running = arriveTimers.current;
    return () => {
      for (const t of running) window.clearTimeout(t);
      running.length = 0;
    };
  }, []);

  async function run(key: string, action: () => Promise<unknown>) {
    if (pending.has(key)) return;
    setPending((p) => new Set(p).add(key));
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : tx("Não foi possível salvar a marcação."));
    } finally {
      setPending((p) => {
        const n = new Set(p);
        n.delete(key);
        return n;
      });
    }
  }

  /** tick ↔ untick. Ticking animates and holds the row; untick clears that state at once. */
  async function toggle(e: MedEntry) {
    const key = `${e.kid.id}|${e.medKey}|${e.slot}`;
    const given = givenToday.get(key);
    if (given) {
      forget(key);
      await run(key, () => undoMedication(token, given.id));
      return;
    }
    await run(key, () => giveMedication(token, { personId: e.kid.id, medName: e.med.name, day, slot: e.slot }));
    start(key);
  }

  const body = (() => {
    if (loading) return <p className="opt-empty">{tx("Sincronizando medicações… 🏕️")}</p>;
    if (kidsWithMeds === 0)
      return card ? (
        <p className="opt-empty">{tx("Nenhuma criança com medicação cadastrada.")}</p>
      ) : (
        <div className="admin-empty">
          <img className="admin-empty__icon" src={ICONS.medications} alt="" aria-hidden="true" />
          <p>{tx("Nenhuma criança com medicação cadastrada.")}</p>
        </div>
      );

    const isToday = day === todayIso();
    const clock = nowTime(now !== undefined ? new Date(now) : undefined);
    /** the moment happening now: the last one already reached today */
    const currentSlot = isToday ? (slots.filter((s) => minutesOf(s.slot) <= minutesOf(clock)).slice(-1)[0]?.slot ?? null) : null;
    const keyOf = (e: MedEntry) => `${e.kid.id}|${e.medKey}|${e.slot}`;

    /**
     * What to show of a round, in order. A row ticked seconds ago still counts
     * as pending so it keeps its place while the undo window is open; after
     * that it either disappears (only-what-is-missing) or sinks to the end.
     */
    const rowsOf = (rows: MedEntry[]) => {
      const open = rows.filter((e) => !givenToday.has(keyOf(e)) || grace.has(keyOf(e)));
      if (hideDone) return open;
      return [...open, ...rows.filter((e) => givenToday.has(keyOf(e)) && !grace.has(keyOf(e)))];
    };

    /** "quando necessário" sits right after the round happening now (tab only) */
    const sosBlock =
      card || sos.length === 0 ? null : (
        <section className="detail-section">
          <h2 className="detail-h2 meds-round__h">
            <span className="meds-round__emoji" aria-hidden="true">
              🆘
            </span>
            <span className="meds-round__when">{tx("Quando necessário")}</span>
            <span className="meds-round__chips">
              <span className="cat-tab__count">{sos.length}</span>
            </span>
          </h2>
          <p className="cat-hint">{tx("Sem horário fixo. Cada dose fica registrada com a hora e quem deu.")}</p>
          <ul className="meds-rows meds-rows--sos">
            {sos.map((e) => {
              const key = `${e.kid.id}|${e.medKey}`;
              const taken = sosToday.get(key) ?? [];
              return (
                <li key={key} className={`bus-row meds-row meds-row--tick meds-row--sos ${taken.length ? "bus-row--on" : ""} ${e.kid.aiReviewStatus === "pending" || e.kid.aiReviewStatus === "processing" || e.kid.aiReviewStatus === "structured" ? "camper-ai-review" : ""}`} title={e.kid.aiReviewStatus === "pending" || e.kid.aiReviewStatus === "processing" || e.kid.aiReviewStatus === "structured" ? tx("Cadastro em revisão pela IA") : undefined}>
                  {/* the kid + WhatsApp are ONE line: on a phone the icon is simply the last
                      item of that line (top right of the card), never a floating overlay */}
                  <div className="meds-sos__top">
                    <button type="button" className="meds-row__hit" title={tx("Ver {name}", { name: e.kid.name })} onClick={() => setPeek({ id: e.kid.id, name: e.kid.name, health: e.health })}>
                      <MedBody entry={e} sosDoses={taken} room={roomOf(e.kid.bedroom)} firstOf={firstOf} labelOf={healthLabel} />
                    </button>
                    <OpsFamilyContact token={token} camperId={e.kid.id} kidName={e.kid.name} className="meds-sos__wa" />
                  </div>
                  <span className="meds-row__actions">
                    {taken.length > 0 && (
                      <button
                        type="button"
                        className="icon-btn meds-row__undo"
                        title={tx("Desfazer a última dose")}
                        aria-label={tx("Desfazer a última dose")}
                        disabled={pending.has(key)}
                        onClick={() => void run(key, () => undoMedication(token, taken[taken.length - 1].id))}
                      >
                        <UndoGlyph />
                      </button>
                    )}
                    <button
                      type="button"
                      className="button button--secondary meds-row__give"
                      disabled={pending.has(key)}
                      onClick={() => void run(key, () => giveMedication(token, { personId: e.kid.id, medName: e.med.name, day, slot: SOS_SLOT }))}
                    >
                      {tx("+ Dose")}
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      );

    const rounds = slots.map(({ slot, rows }) => {
      const visible = rowsOf(rows);
      const done = rows.filter((e) => givenToday.has(keyOf(e))).length;
      const section =
        visible.length === 0 ? null : (
          <section key={slot} className={`meds-round ${card ? "" : "detail-section"} ${slot === currentSlot ? "meds-slot--now" : ""}`}>
            <h2 className={`${card ? "meds-round__title" : "detail-h2"} meds-round__h`}>
              <span className="meds-round__emoji" aria-hidden="true">
                {slotParts(slot).icon ? <img className="audience-icon" src={slotParts(slot).icon} alt="" /> : slotParts(slot).emoji}
              </span>
              <span className="meds-round__when">{slotParts(slot).text}</span>
              <span className="meds-round__chips">
                <span className="cat-tab__count">
                  {done}/{rows.length}
                </span>
                {slot === currentSlot && <span className="meds-slot__now">{tx("agora")}</span>}
              </span>
            </h2>
            <ul className={`meds-rows ${card ? "meds-rows--flat" : ""}`}>
              {visible.map((e) => {
                const key = keyOf(e);
                const given = givenToday.get(key);
                const justTicked = grace.has(key);
                // the undo window is over: fade away when the list hides what is done, otherwise sink to the end
                const going = leaving.has(key);
                const cls = [
                  "meds-item",
                  going && hideDone ? "meds-item--leaving" : "",
                  going && !hideDone ? "meds-item--sinking" : "",
                  arriving.has(key) ? "meds-item--arriving" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <li key={key} className={cls}>
                    <div className={`bus-row meds-row meds-row--tick ${given ? "bus-row--on" : ""} ${justTicked ? "meds-row--ticked" : ""} ${e.kid.aiReviewStatus === "pending" || e.kid.aiReviewStatus === "processing" || e.kid.aiReviewStatus === "structured" ? "camper-ai-review" : ""}`} title={e.kid.aiReviewStatus === "pending" || e.kid.aiReviewStatus === "processing" || e.kid.aiReviewStatus === "structured" ? tx("Cadastro em revisão pela IA") : undefined}>
                      {/* the tick lives in its own checkbox: the rest of the card opens the kid */}
                      <label className="meds-check" title={given ? tx("Dado por {name} · {when} — desmarque para desfazer", { name: firstOf(given.byPersonId), when: speakStamp(given.givenAt) }) : tx("Marcar como dado")}>
                        <input
                          type="checkbox"
                          className="meds-check__input"
                          checked={!!given}
                          disabled={pending.has(key)}
                          aria-label={tx("{med} de {name} — marcar como dado", { med: e.med.name, name: e.kid.name })}
                          onChange={() => void toggle(e)}
                        />
                        {/* an empty box until it is ticked — nothing inside competes with the tick */}
                        <span className={`bus-row__check meds-row__check ${given ? "bus-row__check--on" : ""}`} aria-hidden="true">
                          {given && <CheckGlyph size="1.2em" />}
                        </span>
                      </label>
                      <button type="button" className="meds-row__hit" title={tx("Ver {name}", { name: e.kid.name })} onClick={() => setPeek({ id: e.kid.id, name: e.kid.name, health: e.health })}>
                        <MedBody entry={e} given={given} room={roomOf(e.kid.bedroom)} firstOf={firstOf} labelOf={healthLabel} />
                      </button>
                      {/* while the dose can still be taken back, the corner offers exactly that */}
                      {justTicked ? (
                        <button type="button" className="button button--secondary meds-row__undo-btn" disabled={pending.has(key)} onClick={() => void toggle(e)}>
                          <UndoGlyph /> {tx("Desfazer")}
                        </button>
                      ) : (
                        <OpsFamilyContact token={token} camperId={e.kid.id} kidName={e.kid.name} className="meds-row__wa" />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      return slot === currentSlot ? (
        <div key={slot} className="meds-round-group">
          {section}
          {sosBlock}
        </div>
      ) : (
        section
      );
    });

    const nothingLeft = rounds.every((r) => r === null) && unscheduled.length === 0;

    return (
      <>
        {!card && (
          <div className="meds-toolbar">
            <SearchField value={search} onChange={setSearch} placeholder={tx("Procurar criança…")} aria-label={tx("Procurar criança")} />
            <button type="button" className={`cat-tab ${onlyMissing ? "cat-tab--active" : ""}`} aria-pressed={onlyMissing} onClick={() => setOnlyMissing((v) => !v)}>
              ⏳ {tx("Só o que falta")}
            </button>
            {total > 0 && (
              <span className={`meds-progress ${doneCount === total ? "meds-progress--done" : ""}`}>
                {tx("{done}/{total} dadas", { done: doneCount, total })}
              </span>
            )}
          </div>
        )}

        {error && <p className="message message--error">{error}</p>}

        {/* ── medicines the parents never scheduled ── */}
        {unscheduled.length > 0 && (
          <section className={`meds-round meds-round--warn ${card ? "" : "detail-section"}`}>
            <h2 className={`${card ? "meds-round__title" : "detail-h2"} meds-round__h`}>
              <span className="meds-round__emoji" aria-hidden="true">
                ⚠️
              </span>
              <span className="meds-round__when">{tx("Horário a confirmar")}</span>
              <span className="meds-round__chips">
                <span className="cat-tab__count">{unscheduled.length}</span>
              </span>
            </h2>
            <p className="cat-hint">{tx('Sem horário nem "quando necessário": confirme com os pais antes de dar.')}</p>
            <ul className={`meds-rows ${card ? "meds-rows--flat" : ""}`}>
              {unscheduled.map((e) => (
                <li key={`${e.kid.id}|${e.medKey}`} className="meds-item">
                  <div className={`bus-row meds-row meds-row--tick meds-row--warn ${e.kid.aiReviewStatus === "pending" || e.kid.aiReviewStatus === "processing" || e.kid.aiReviewStatus === "structured" ? "camper-ai-review" : ""}`} title={e.kid.aiReviewStatus === "pending" || e.kid.aiReviewStatus === "processing" || e.kid.aiReviewStatus === "structured" ? tx("Cadastro em revisão pela IA") : undefined}>
                    <span className="bus-row__check meds-row__check meds-row__check--warn" aria-hidden="true">
                      ?
                    </span>
                    <button type="button" className="meds-row__hit" title={tx("Abrir a ficha de {name}", { name: e.kid.name })} onClick={() => navigate(`/campers/${e.kid.id}`)}>
                      <MedBody entry={e} room={roomOf(e.kid.bedroom)} firstOf={firstOf} labelOf={healthLabel} />
                    </button>
                    <OpsFamilyContact token={token} camperId={e.kid.id} kidName={e.kid.name} className="meds-row__wa" />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* no round is "now" (another day, or before the first moment): the SOS block opens the list */}
        {!currentSlot && sosBlock}
        {rounds}

        {nothingLeft &&
          (card ? (
            <p className="meds-clear">{tx("✅ Tudo em dia por aqui.")}</p>
          ) : (
            <p className="opt-empty">{total === 0 && sos.length === 0 ? tx("Nenhuma criança encontrada.") : tx("Nada pendente por aqui. ✅")}</p>
          ))}
      </>
    );
  })();

  const peekDialog = <CamperPeekDialog camperId={peek?.id ?? null} name={peek?.name} health={peek?.health ?? null} onClose={() => setPeek(null)} />;

  if (!card)
    return (
      <>
        {body}
        {peekDialog}
      </>
    );

  const allDone = total > 0 && doneCount === total;
  return (
    <section className="detail-card meds-day" aria-label={tx("Medicações de hoje")}>
      <header className="meds-day__head">
        <h2 className="detail-h2 meds-day__title">
          <img className="audience-icon" src={ICONS.medications} alt="" aria-hidden="true" />
          {title ?? tx("Medicações de hoje")}
        </h2>
        {total > 0 && (
          <span className={`meds-progress ${allDone ? "meds-progress--done" : ""}`}>
            {tx("{done}/{total} dadas", { done: doneCount, total })}
          </span>
        )}
      </header>
      {body}
      {peekDialog}
    </section>
  );
}

/** name + room chip + medicine + dose, plus who gave it and any warning about the kid */
function MedBody({ entry, given, sosDoses, room, firstOf, labelOf }: { entry: MedEntry; given?: MedicationDose; sosDoses?: MedicationDose[]; room?: Pick<Bedroom, "name" | "group"> | null; firstOf: (personId: string) => string; labelOf: (id: string) => string }) {
  const { tx } = useI18n();
  const { kid, med } = entry;
  const cannotTake = entry.drugAllergies.length > 0;
  const drugs = entry.drugAllergies.map(labelOf).filter(Boolean).join(", ");
  const flag = drugs ? tx("Alergia a medicamentos: {list} — confira antes de dar", { list: drugs }) : tx("A criança tem alergia a medicamentos — confira antes de dar");
  return (
    <span className="bus-row__body">
      <span className="bus-row__name">
        {kid.name || "…"}
        {room && (
          <span className="meds-room" title={bedroomLabel(room)}>
            <BedIcon size={14} group={room.group} />
            {room.name}
          </span>
        )}
        {cannotTake && (
          <span className="meds-row__flag" role="img" title={flag} aria-label={flag}>
            🚫💊
          </span>
        )}
      </span>
      <span className="bus-row__meta">
        💊 {[med.name, med.dose].filter(Boolean).join(" ")}
        {med.notes && <> · {med.notes}</>}
      </span>
      {given && (
        <span className="meds-row__given">
          ✅ {firstOf(given.byPersonId)} · {speakStamp(given.givenAt)}
        </span>
      )}
      {sosDoses && sosDoses.length > 0 && (
        <span className="meds-row__given">
          ✅ {sosDoses.map((d) => `${speakStamp(d.givenAt)} (${firstOf(d.byPersonId)})`).join(" · ")}
        </span>
      )}
    </span>
  );
}
