import { useI18n } from "../i18n";
import { AiGlyph } from "./Glyph";
import type { useAiNotesSorter } from "../hooks/useAiNotesSorter";

interface AiNotesFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  disabled?: boolean;
  sorter: ReturnType<typeof useAiNotesSorter>;
}

/**
 * The observations textarea with the ✨ switch on its label. Paste or blur
 * hands the text to the sorter (see useAiNotesSorter), which fills the other
 * fields of the form and leaves here only what fits nowhere else.
 */
export default function AiNotesField({ label, value, onChange, placeholder, rows = 3, maxLength = 1000, disabled, sorter }: AiNotesFieldProps) {
  const { tx } = useI18n();
  return (
    <label className="cat-field cat-field--grow">
      <span className="cat-field__label cat-field__label--ai">
        {label}
        {sorter.available && (
          <button
            type="button"
            className={`ai-notes-btn ${sorter.on ? "ai-notes-btn--on" : ""} ${sorter.running ? "ai-notes-btn--busy" : ""}`}
            role="switch"
            aria-checked={sorter.on}
            title={sorter.on ? tx("IA ligada: ao colar ou sair do campo, o texto é distribuído nos campos acima") : tx("IA desligada")}
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()} // don't blur the textarea (which would fire the sorter)
            onClick={sorter.toggle}
          >
            <AiGlyph /> {sorter.running ? tx("organizando…") : sorter.on ? tx("organizar com IA") : tx("IA desligada")}
          </button>
        )}
      </span>
      <textarea
        className={`cat-input cat-input--area ${sorter.running ? "cat-input--busy" : ""}`}
        rows={rows}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => void sorter.sort(e.target.value)}
        onPaste={(e) => {
          // the pasted text isn't in the value yet: let the textarea apply it, then sort
          const el = e.currentTarget;
          setTimeout(() => void sorter.sort(el.value), 0);
        }}
      />
      {sorter.error && <p className="cat-hint cat-hint--error">{sorter.error}</p>}
    </label>
  );
}
