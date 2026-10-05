import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CAMPER_CATEGORY_KEYS, EMPTY_HEALTH, blankMedication, medicalUpdateCamper, type HealthInfo, type Medication, type MedicalPatch } from "../api/campers";
import type { Category } from "../api/categories";
import type { HealthList } from "../api/people";
import { CategoryChips } from "./CategoryFields";
import MedicationsEditor from "./MedicationsEditor";
import Dialog from "./Dialog";
import NoPillIcon from "./NoPillIcon";
import Toggle from "./Toggle";
import { useFieldDedup } from "../hooks/useFieldDedup";
import { loadHealthLists, useHealthLabel } from "../hooks/usePersonData";
import type { DedupField } from "../api/ai";
import { useCategories } from "../store/derive";
import { useI18n } from "../i18n";

// ── the church health lists as chip categories ───────────────────────────────

/**
 * The church's health option lists as pickable categories (chips) — option
 * ids are the ones IPAlpha stores. While the lists are on their way (or
 * offline) Acampa's own import categories stand in; the server maps those to
 * the church's by label.
 */
export function useHealthCategories(token: string): (key: string) => Category | undefined {
  const local = useCategories("camper");
  const label = useHealthLabel(token);
  const [lists, setLists] = useState<HealthList[] | null>(null);
  useEffect(() => {
    let alive = true;
    loadHealthLists(token)
      .then((l) => alive && setLists(l))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [token]);
  return useMemo(() => {
    const fromLists = new Map<string, Category>();
    for (const l of lists ?? []) {
      fromLists.set(l.key, {
        id: `church:${l.key}`,
        key: l.key,
        name: l.key,
        emoji: l.key === "alergias" ? "🤮" : l.key === "condicao-cronica" ? "🩺" : "",
        description: "",
        appliesTo: ["camper", "staff"],
        selection: "multiple",
        order: 0,
        options: l.options
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((o) => ({ id: o.id, label: label(o.id) || o.id, order: o.order, active: o.active })),
        createdAt: "",
        updatedAt: "",
      });
    }
    return (key: string) => fromLists.get(key) ?? local.find((c) => c.key === key);
  }, [lists, local, label]);
}

// ── the health block being edited ─────────────────────────────────────────────

/** The health form state: values + one switch per topic (off = nothing to declare). */
export interface HealthDraft {
  health: HealthInfo;
  /** as typed ("28,5") */
  weight: string;
  on: { allergies: boolean; drugAllergies: boolean; healthIssues: boolean; medications: boolean; foodRestrictions: boolean; healthNotes: boolean };
}

export function healthDraftOf(h: HealthInfo | null): HealthDraft {
  const k = h ?? EMPTY_HEALTH;
  return {
    health: { ...EMPTY_HEALTH, ...k },
    weight: k.weightKg != null ? String(k.weightKg).replace(".", ",") : "",
    on: { allergies: k.allergies.length > 0, drugAllergies: k.drugAllergies.length > 0, healthIssues: k.healthIssues.length > 0, medications: k.medications.length > 0, foodRestrictions: !!k.foodRestrictions, healthNotes: !!k.healthNotes },
  };
}

/** The weight typed, parsed; `ok` false when out of 5–200 kg. */
export function draftWeight(d: HealthDraft): { kg: number | null; ok: boolean } {
  const kg = d.weight.trim() ? Number(d.weight.trim().replace(",", ".")) : null;
  return { kg: kg !== null && Number.isFinite(kg) ? Math.round(kg * 10) / 10 : kg, ok: kg === null || (Number.isFinite(kg) && kg >= 5 && kg <= 200) };
}

/** The draft as it will be saved (switched-off topics cleared, blanks trimmed). */
export function healthOfDraft(d: HealthDraft): HealthInfo {
  const h = d.health;
  const w = draftWeight(d);
  return {
    allergies: d.on.allergies ? h.allergies : [],
    drugAllergies: d.on.drugAllergies ? h.drugAllergies : [],
    healthIssues: d.on.healthIssues ? h.healthIssues : [],
    neurodivergent: h.neurodivergent,
    medications: d.on.medications ? h.medications.filter((m) => m.name.trim()).map((m) => ({ ...m, name: m.name.trim(), dose: m.dose.trim(), notes: m.notes.trim() })) : [],
    foodRestrictions: d.on.foodRestrictions ? h.foodRestrictions.trim() : "",
    healthNotes: d.on.healthNotes ? h.healthNotes.trim() : "",
    weightKg: w.ok ? w.kg : null,
    insurance: h.insurance.trim(),
    insuranceCard: h.insuranceCard.trim(),
  };
}

interface HealthFieldsProps {
  token: string;
  value: HealthDraft;
  /** functional update (a late dedup answer must not undo newer typing) */
  onChange: (update: (prev: HealthDraft) => HealthDraft) => void;
  disabled?: boolean;
  /** background repeat clean-up of the free-text fields (shared with the surrounding form) */
  dedup: ReturnType<typeof useFieldDedup>;
}

/**
 * The health fields (same order the families see): convênio, weight, then a
 * switch per topic that reveals its field, and the neurodivergence switch.
 */
export function HealthFields({ token, value: d, onChange, disabled, dedup }: HealthFieldsProps) {
  const { tx } = useI18n();
  const cat = useHealthCategories(token);
  const set = <K extends keyof HealthInfo>(key: K, v: HealthInfo[K]) => onChange((p) => ({ ...p, health: { ...p.health, [key]: v } }));
  const turn = (key: keyof HealthDraft["on"], on: boolean) => onChange((p) => ({ ...p, on: { ...p.on, [key]: on } }));
  const weight = draftWeight(d);

  const text = (label: string, key: "insurance" | "insuranceCard" | "foodRestrictions" | "healthNotes", placeholder = "", rows?: number, dedupAs?: DedupField) => {
    const v = d.health[key];
    const cls = `cat-input${rows ? " cat-input--area" : ""}${dedupAs && dedup.busy(dedupAs) ? " cat-input--busy" : ""}`;
    const onBlur = dedupAs ? () => void dedup.run(dedupAs, v, (x) => set(key, x)) : undefined;
    return (
      <label className="cat-field cat-field--grow">
        <span className="cat-field__label">{label}</span>
        {rows ? (
          <textarea className={cls} rows={rows} value={v} placeholder={placeholder} maxLength={1000} disabled={disabled} onChange={(e) => set(key, e.target.value)} onBlur={onBlur} />
        ) : (
          <input className={cls} value={v} placeholder={placeholder} maxLength={120} disabled={disabled} onChange={(e) => set(key, e.target.value)} onBlur={onBlur} />
        )}
      </label>
    );
  };

  /** a switch that reveals its field only when on */
  const optional = (label: ReactNode, key: keyof HealthDraft["on"], field: ReactNode, onTurn?: (on: boolean) => void) => (
    <div className="cat-field opt-field">
      <div className="opt-field__head">
        <Toggle checked={d.on[key]} onChange={(on) => (onTurn ? onTurn(on) : turn(key, on))} disabled={disabled} label={label} />
      </div>
      {d.on[key] && field}
    </div>
  );

  return (
    <>
      <div className="cat-form__row staff-form__row">
        {text(tx("🏥 Convênio médico"), "insurance", tx("ex.: Bradesco"))}
        {text(tx("Carteirinha"), "insuranceCard")}
      </div>

      <label className="cat-field cat-field--weight">
        <span className="cat-field__label">{tx("⚖️ Peso (kg)")}</span>
        <input className="cat-input" inputMode="decimal" placeholder={tx("ex.: 28,5")} value={d.weight} maxLength={6} disabled={disabled} onChange={(e) => {
            const weight = e.target.value;
            onChange((p) => ({ ...p, weight }));
          }} />
        {d.weight.trim() && !weight.ok && <p className="cat-hint cat-hint--error">{tx("Entre 5 e 200 kg.")}</p>}
      </label>

      {optional(tx("🤮 Alergias"), "allergies", <CategoryChips label={tx("Quais")} category={cat(CAMPER_CATEGORY_KEYS.allergies)} value={d.health.allergies} onChange={(v) => set("allergies", v)} disabled={disabled} />)}
      {optional(
        <>
          <NoPillIcon /> {tx("Alergia a medicamentos")}
        </>,
        "drugAllergies",
        <CategoryChips label={tx("Quais")} category={cat(CAMPER_CATEGORY_KEYS.drugAllergies)} value={d.health.drugAllergies} onChange={(v) => set("drugAllergies", v)} disabled={disabled} />,
      )}
      {optional(tx("🩺 Condição crônica"), "healthIssues", <CategoryChips label={tx("Quais")} category={cat(CAMPER_CATEGORY_KEYS.healthIssues)} value={d.health.healthIssues} onChange={(v) => set("healthIssues", v)} disabled={disabled} />)}
      {optional(tx("💊 Medicação de uso diário"), "medications", <MedicationsEditor value={d.health.medications} onChange={(v: Medication[]) => set("medications", v)} disabled={disabled} />, (on) =>
        onChange((p) => ({ ...p, on: { ...p.on, medications: on }, health: on && p.health.medications.length === 0 ? { ...p.health, medications: [blankMedication()] } : p.health })),
      )}
      {optional(tx("🍽️ Alimentação / restrições"), "foodRestrictions", text(tx("Quais"), "foodRestrictions", tx("ex.: sem lactose"), 2, "foodRestrictions"))}
      {optional(tx("🩺 Observações médicas"), "healthNotes", text(tx("Observações"), "healthNotes", tx("ex.: em caso de crise, 4 puffs de Aerolin…"), 3, "healthNotes"))}

      <div className="cat-field opt-field">
        <div className="opt-field__head">
          <Toggle checked={d.health.neurodivergent} onChange={(v) => set("neurodivergent", v)} disabled={disabled} label={tx("🧩 Neurodivergente (TEA, TDAH…)")} />
        </div>
      </div>
    </>
  );
}

// ── the dialog ────────────────────────────────────────────────────────────────

interface HealthEditDialogProps {
  token: string;
  open: boolean;
  /** the kid (IPAlpha person id) */
  camperId: string;
  /** the kid's live name (title) */
  name: string;
  /** the health as read live from IPAlpha right now (null = nothing declared yet) */
  health: HealthInfo | null;
  onClose: () => void;
  /** after a save: the health as IPAlpha now holds it */
  onSaved?: (health: HealthInfo | null) => void;
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/**
 * The care team (`saude`) or the coordenação edits a kid's health block,
 * written to IPAlpha. Only changed fields are sent — the server re-validates
 * everything and logs WHICH fields changed, by whom and when (no values).
 * Mount it while open: it starts from the `health` it receives.
 */
export default function HealthEditDialog({ token, open, camperId, name, health, onClose, onSaved }: HealthEditDialogProps) {
  const { tx } = useI18n();
  const before = health ?? EMPTY_HEALTH;
  const [draft, setDraft] = useState<HealthDraft>(() => healthDraftOf(health));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dedup = useFieldDedup({ token, busy });

  const weightOk = draftWeight(draft).ok;
  const saved = healthOfDraft(draft);
  const patch: MedicalPatch = {};
  if (!sameSet(saved.allergies, before.allergies)) patch.allergies = saved.allergies;
  if (!sameSet(saved.drugAllergies, before.drugAllergies)) patch.drugAllergies = saved.drugAllergies;
  if (!sameSet(saved.healthIssues, before.healthIssues)) patch.healthIssues = saved.healthIssues;
  if (saved.neurodivergent !== (before.neurodivergent === true)) patch.neurodivergent = saved.neurodivergent;
  if (JSON.stringify(saved.medications) !== JSON.stringify(before.medications)) patch.medications = saved.medications;
  if (saved.foodRestrictions !== before.foodRestrictions) patch.foodRestrictions = saved.foodRestrictions;
  if (saved.healthNotes !== before.healthNotes) patch.healthNotes = saved.healthNotes;
  if (saved.weightKg !== before.weightKg) patch.weightKg = saved.weightKg;
  if (saved.insurance !== before.insurance) patch.insurance = saved.insurance;
  if (saved.insuranceCard !== before.insuranceCard) patch.insuranceCard = saved.insuranceCard;
  const changed = Object.keys(patch).length > 0;

  async function submit() {
    if (!changed || !weightOk || busy) return;
    dedup.cancelAll();
    setBusy(true);
    setError(null);
    try {
      const answer = await medicalUpdateCamper(token, camperId, patch);
      onSaved?.(answer.camper.health ?? null);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : tx("Algo deu errado."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={tx("Editar saúde")} width={620} dismissible={!busy} className="attention-sheet-dialog">
      <div className="cat-form attention-sheet">
        <header className="attention-sheet__head">
          <span className="attention-sheet__handle" aria-hidden="true" />
          <h2 className="cat-form__title">{tx("🩺 Saúde de {name}", { name: name.split(" ")[0] || tx("a criança") })}</h2>
          <p className="cat-hint">{tx("Fica guardado no IPAlpha, com o cuidado que essas informações pedem. O histórico registra só quais campos mudaram, quem e quando.")}</p>
        </header>

        <div className="attention-sheet__body">
          <HealthFields token={token} value={draft} onChange={setDraft} disabled={busy} dedup={dedup} />
          {error && <p className="message message--error">{error}</p>}
        </div>

        <div className="cat-form__actions attention-sheet__actions">
          <button type="button" className="button button--secondary" onClick={onClose} disabled={busy}>
            {tx("Cancelar")}
          </button>
          <button type="button" className="button button--primary" disabled={busy || !changed || !weightOk} onClick={submit}>
            {busy ? tx("Salvando…") : tx("Salvar")}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
