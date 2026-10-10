import type { ReactNode } from "react";

export interface OptionCard<K extends string> {
  key: K;
  icon: string;
  title: ReactNode;
  /** one line on what picking this does — only when the choice takes some effort to understand */
  subtitle?: ReactNode;
}

interface OptionCardsProps<K extends string> {
  options: OptionCard<K>[];
  /** the picked one (null = none yet) */
  value: K | null;
  onChange: (key: K) => void;
  /** what the choice is about, for screen readers */
  label: string;
  disabled?: boolean;
  /** side by side (short titles) instead of stacked */
  row?: boolean;
}

/**
 * The house way to pick one thing among a few: one card per option, an icon
 * from the project set + a title (+ a subtitle when the choice needs it).
 * Radio buttons are for engineering settings only.
 */
export default function OptionCards<K extends string>({ options, value, onChange, label, disabled, row }: OptionCardsProps<K>) {
  return (
    <div className={`option-cards ${row ? "option-cards--row" : ""}`} role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button key={o.key} type="button" role="radio" aria-checked={on} className={`option-card ${on ? "option-card--on" : ""}`} disabled={disabled} onClick={() => onChange(o.key)}>
            <img src={o.icon} alt="" aria-hidden="true" />
            <span>
              <strong>{o.title}</strong>
              {o.subtitle && <small>{o.subtitle}</small>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
