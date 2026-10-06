import { ROOM_ROLE_META } from "../api/staff";
import { ICONS } from "../icons";
import { useI18n } from "../i18n";

/** Who a general document (Instruções / Preparação) is for. */
export type DocAudience = "all" | "caretaker" | "helper";

export const DOC_AUDIENCE_META: Record<DocAudience, { label: string; icon: string; hint: string }> = {
  all: { label: "Todos", icon: ICONS.staff, hint: "toda a equipe" },
  caretaker: { label: ROOM_ROLE_META.caretaker.label + "s", icon: ROOM_ROLE_META.caretaker.icon!, hint: "só quem cuida de crianças" },
  helper: { label: ROOM_ROLE_META.helper.label + "es", icon: ROOM_ROLE_META.helper.icon!, hint: "só os auxiliares de quarto" },
};

/** The paper-cut icon of an audience — `large` for the big tap targets (sizes live in styles.scss). */
function AudienceIcon({ src, large = false }: { src: string; large?: boolean }) {
  return <img className={large ? "audience-icon audience-icon--lg" : "audience-icon"} src={src} alt="" aria-hidden="true" />;
}

interface AudiencePickerProps {
  value: DocAudience;
  onChange: (v: DocAudience) => void;
  disabled?: boolean;
}

/** Three big tap targets: everyone / caretakers / helpers. */
export default function AudiencePicker({ value, onChange, disabled }: AudiencePickerProps) {
  const { tx } = useI18n();
  return (
    <fieldset className="cat-fieldset">
      <legend className="cat-field__label">{tx("Quem vê")}</legend>
      <div className="big-options big-options--row">
        {(Object.keys(DOC_AUDIENCE_META) as DocAudience[]).map((a) => {
          const on = value === a;
          return (
            <button key={a} type="button" className={`big-option ${on ? "big-option--on" : ""}`} aria-pressed={on} disabled={disabled} onClick={() => onChange(a)}>
              <span className="big-option__emoji" aria-hidden="true"><AudienceIcon src={DOC_AUDIENCE_META[a].icon} large /></span>
              <span className="big-option__label">{tx(DOC_AUDIENCE_META[a].label)}</span>
              <span className="big-option__hint">{tx(DOC_AUDIENCE_META[a].hint)}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

// ── Preparação: a section is POSTED to one or more groups (parents / caretakers / helpers) ──

export type PrepAudience = "parent" | "caretaker" | "helper";

export const PREP_AUDIENCE_META: Record<PrepAudience, { label: string; icon: string; hint: string }> = {
  parent: { label: "Famílias", icon: ICONS.parent, hint: "responsáveis pelas crianças" },
  caretaker: { ...DOC_AUDIENCE_META.caretaker, hint: "quem cuida de crianças" },
  helper: { ...DOC_AUDIENCE_META.helper, hint: "os auxiliares de quarto" },
};
const PREP_ORDER: PrepAudience[] = ["parent", "caretaker", "helper"];

interface PrepAudiencePickerProps {
  value: PrepAudience[];
  onChange: (v: PrepAudience[]) => void;
  disabled?: boolean;
}

/** Multi-select: tap to post the section to each group (at least one). */
export function PrepAudiencePicker({ value, onChange, disabled }: PrepAudiencePickerProps) {
  const { tx } = useI18n();
  const toggle = (a: PrepAudience) => onChange(PREP_ORDER.filter((x) => (x === a ? !value.includes(a) : value.includes(x))));
  return (
    <fieldset className="cat-fieldset">
      <legend className="cat-field__label">{tx("Publicar para")}</legend>
      <div className="big-options big-options--row">
        {PREP_ORDER.map((a) => {
          const on = value.includes(a);
          return (
            <button key={a} type="button" className={`big-option ${on ? "big-option--on" : ""}`} aria-pressed={on} disabled={disabled} onClick={() => toggle(a)}>
              <span className="big-option__emoji" aria-hidden="true"><AudienceIcon src={PREP_AUDIENCE_META[a].icon} large /></span>
              <span className="big-option__label">{tx(PREP_AUDIENCE_META[a].label)}</span>
              <span className="big-option__hint">{tx(PREP_AUDIENCE_META[a].hint)}</span>
            </button>
          );
        })}
      </div>
      {value.length === 0 && <p className="cat-hint">{tx("Escolha pelo menos um público.")}</p>}
    </fieldset>
  );
}

/** Tags for lists — one per group the section is posted to. */
export function PrepAudienceTags({ audiences }: { audiences: PrepAudience[] }) {
  const { tx } = useI18n();
  return (
    <>
      {PREP_ORDER.filter((a) => audiences.includes(a)).map((a) => (
        <span key={a} className="staff-tag staff-tag--soft" title={tx(PREP_AUDIENCE_META[a].hint)}>
          <AudienceIcon src={PREP_AUDIENCE_META[a].icon} /> {tx(PREP_AUDIENCE_META[a].label)}
        </span>
      ))}
    </>
  );
}

/** Small tag for lists — nothing when the document is for everyone. */
export function AudienceTag({ audience }: { audience: DocAudience }) {
  const { tx } = useI18n();
  if (audience === "all") return null;
  return (
    <span className="staff-tag staff-tag--soft" title={tx(DOC_AUDIENCE_META[audience].hint)}>
      <AudienceIcon src={DOC_AUDIENCE_META[audience].icon} /> {tx(DOC_AUDIENCE_META[audience].label)}
    </span>
  );
}
