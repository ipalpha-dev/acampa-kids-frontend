/**
 * The health lines of a person (kid or staff), one per kind, icon only — no
 * "Alergias:" prefix, the icon says it. The `title` keeps the wording for
 * screen readers / hover.
 *
 *   ⚠️ chronic conditions   🤮 allergies   🚫💊 drug allergies (must NOT take)
 *   💊 medication (per medicine, with times)   🍽️ food restrictions   🩺 extra medical notes
 */
import { useMemo, type ReactNode } from "react";
import { medicationLine, type Medication } from "../api/campers";
import { useHealthLabel } from "../hooks/usePersonData";
import { useI18n } from "../i18n";
import NoPillIcon from "./NoPillIcon";

/**
 * `labelOf` for `<HealthAlerts>` over the church health lists (+ Acampa's old
 * import categories): option id → label, null when unknown (the line is
 * skipped rather than showing a raw id).
 */
export function useHealthLabelOf(token: string): (id: string | null | undefined) => string | null {
  const label = useHealthLabel(token);
  return useMemo(() => (id: string | null | undefined) => (id ? label(id) || null : null), [label]);
}

export interface HealthLike {
  allergies: string[];
  drugAllergies: string[];
  healthIssues: string[];
  /** structured list with schedule */
  medications: Medication[];
  foodRestrictions: string;
  healthNotes: string;
  /** kids only (admin / medical view) */
  neurodivergent?: boolean;
}

interface HealthAlertsProps {
  person: HealthLike;
  labelOf: (id: string | null | undefined) => string | null;
  /** wrap in the `.detail-alerts` box (detail pages) instead of bare lines (cards) */
  boxed?: boolean;
}

/** the person's medication as ONE readable text — "" when none */
export function medicinesText(p: HealthLike): string {
  return p.medications.map(medicationLine).join("; ");
}

export function healthLines(p: HealthLike, labelOf: HealthAlertsProps["labelOf"]) {
  const health = p.healthIssues.map(labelOf).filter(Boolean) as string[];
  const allergies = p.allergies.map(labelOf).filter(Boolean) as string[];
  const drugs = p.drugAllergies.map(labelOf).filter(Boolean) as string[];
  const lines: { icon: ReactNode; title: string; text: string; soft?: boolean }[] = [];
  if (health.length) lines.push({ icon: "⚠️", title: "Condição de saúde", text: health.join(", ") });
  if (p.neurodivergent) lines.push({ icon: "🧩", title: "Neurodivergente", text: "Neurodivergente" });
  if (allergies.length) lines.push({ icon: "🤮", title: "Alergias", text: allergies.join(", ") });
  if (drugs.length) lines.push({ icon: <NoPillIcon />, title: "Não pode tomar", text: drugs.join(", ") });
  const meds = medicinesText(p);
  if (meds) lines.push({ icon: "💊", title: "Medicação", text: meds });
  if (p.foodRestrictions) lines.push({ icon: "🍽️", title: "Alimentação", text: p.foodRestrictions });
  if (p.healthNotes) lines.push({ icon: "🩺", title: "Observações médicas", text: p.healthNotes, soft: true });
  return lines;
}

/** one medicine per line, with the times standing out — what the medical checklist will tick */
function MedicationLines({ list }: { list: Medication[] }) {
  const { tx } = useI18n();
  return (
    <ul className="meds__list">
      {list.map((m, i) => {
        const when = m.asNeeded ? tx("quando necessário") : m.times.length ? m.times.join(" · ") : tx("horário a confirmar");
        const missing = !m.asNeeded && m.times.length === 0;
        return (
          <li key={i} className="staff-card__alert" title={tx("Medicação")}>
            <span className="staff-card__alert-icon" role="img" aria-label={tx("Medicação")}>
              💊
            </span>{" "}
            <span>
              {[m.name, m.dose].filter(Boolean).join(" ")} <span className={`meds__when ${missing ? "meds__when--missing" : ""}`}>· {when}</span>
              {m.notes && <span className="staff-card__alert--soft"> · {m.notes}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export default function HealthAlerts({ person, labelOf, boxed }: HealthAlertsProps) {
  const { tx } = useI18n();
  const lines = healthLines(person, labelOf);
  if (lines.length === 0) return null;
  const items = lines.map((l) =>
    l.title === "Medicação" && person.medications.length ? (
      <MedicationLines key={l.title} list={person.medications} />
    ) : (
      <p key={l.title} className={`staff-card__alert ${l.soft ? "staff-card__alert--soft" : ""}`} title={tx(l.title)}>
        <span className="staff-card__alert-icon" role="img" aria-label={tx(l.title)}>
          {l.icon}
        </span>{" "}
        {l.title === "Neurodivergente" ? tx(l.text) : l.text}
      </p>
    ),
  );
  return boxed ? <div className="detail-alerts">{items}</div> : <>{items}</>;
}
