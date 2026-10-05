import { useState } from "react";
import {
  AUDIENCE_META,
  CATEGORY_AUDIENCES,
  CATEGORY_SELECTIONS,
  SELECTION_META,
  type Category,
  type CategoryAudience,
  type CategoryInput,
  type CategorySelection,
} from "../../api/categories";
import AudienceIcon from "../../components/AudienceIcon";
import EmojiPicker from "../../components/EmojiPicker";
import { useAiAutoFill } from "../../hooks/useAiAutoFill";
import { useHideScanFab } from "../../scanFab";
import { useI18n } from "../../i18n";

const EMOJI_SUGGESTIONS = ["🏷️", "🚩", "🛏️", "🤮", "🚫", "💊", "🍽️", "🚌", "👕", "🎒", "🏊", "🎨", "⚽", "🎵", "📚", "🧸"];

interface CategoryFormProps {
  token: string;
  /** when editing, the existing category; when creating, undefined */
  category?: Category;
  busy?: boolean;
  onSubmit: (input: CategoryInput) => Promise<void>;
  onCancel: () => void;
}

/**
 * Create / edit a category's metadata (NOT its options — those are edited
 * in the tab itself). When creating, an optional first batch of options can
 * be typed one per line.
 */
export default function CategoryForm({ token, category, busy, onSubmit, onCancel }: CategoryFormProps) {
  // the "Ler crachá" FAB would sit on top of Salvar / Cancelar
  useHideScanFab();
  const { tx, te } = useI18n();
  const editing = !!category;
  const [name, setName] = useState(category?.name ?? "");
  const [emoji, setEmoji] = useState(category?.emoji ?? "🏷️");
  const [description, setDescription] = useState(category?.description ?? "");
  const [appliesTo, setAppliesTo] = useState<CategoryAudience[]>(category?.appliesTo ?? ["camper", "staff"]);
  const [selection, setSelection] = useState<CategorySelection>(category?.selection ?? "single");
  const [optionsText, setOptionsText] = useState("");
  const [error, setError] = useState<string | null>(null);

  function toggleAudience(a: CategoryAudience) {
    setAppliesTo((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));
  }

  const valid = name.trim().length > 0 && appliesTo.length > 0;
  const ai = useAiAutoFill({
    token,
    context: "category",
    title: name,
    setTitle: setName,
    emoji,
    setEmoji,
    defaultEmoji: "🏷️",
    emojiSuggestions: EMOJI_SUGGESTIONS,
    existing: editing,
    html: [description, optionsText].filter(Boolean).join("\n"),
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setError(null);
    const input: CategoryInput = {
      name: name.trim(),
      emoji: emoji.trim() || "🏷️",
      description: description.trim(),
      appliesTo: CATEGORY_AUDIENCES.filter((a) => appliesTo.includes(a)),
      selection,
    };
    if (!editing) {
      const options = optionsText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      if (options.length) input.options = options;
    }
    try {
      await onSubmit(input);
    } catch (err) {
      setError(te(err, "Algo deu errado."));
    }
  }

  return (
    <form className="cat-form cat-form--plain" onSubmit={handleSubmit}>
      <h2 className="cat-form__title change-room__title">{editing ? tx("✏️ Editar categoria") : tx("Nova categoria")}</h2>

      <div className="cat-form__row">
        <div className="cat-field cat-field--emoji">
          <span className="cat-field__label">{tx("Ícone")}</span>
          <EmojiPicker value={emoji} onChange={ai.pickEmoji} suggestions={EMOJI_SUGGESTIONS} disabled={busy} guessing={ai.suggestingEmoji} />
        </div>
        <label className="cat-field cat-field--grow">
          <span className="cat-field__label">{tx("Nome")}</span>
          <input
            className="cat-input"
            placeholder={tx("ex.: Transporte")}
            value={name}
            maxLength={60}
            autoFocus
            onChange={(e) => setName(e.target.value)}
          />
        </label>
      </div>

      <label className="cat-field">
        <span className="cat-field__label">{tx("Descrição (opcional)")}</span>
        <input
          className="cat-input"
          placeholder={tx("ex.: Como a pessoa chega ao acampamento")}
          value={description}
          maxLength={200}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>

      <fieldset className="cat-fieldset">
        <legend className="cat-field__label">{tx("Vale para quem?")}</legend>
        <div className="chip-group">
          {CATEGORY_AUDIENCES.map((a) => {
            const m = AUDIENCE_META[a];
            const on = appliesTo.includes(a);
            return (
              <button
                key={a}
                type="button"
                className={`chip-toggle ${on ? "chip-toggle--on" : ""}`}
                aria-pressed={on}
                onClick={() => toggleAudience(a)}
              >
                <AudienceIcon audience={a} /> {tx(m.label)}
              </button>
            );
          })}
        </div>
        {appliesTo.length === 0 && <p className="cat-hint cat-hint--error">{tx("Escolha ao menos um.")}</p>}
      </fieldset>

      <fieldset className="cat-fieldset">
        <legend className="cat-field__label">{tx("Como se responde?")}</legend>
        <div className="chip-group">
          {CATEGORY_SELECTIONS.map((s) => {
            const m = SELECTION_META[s];
            const on = selection === s;
            return (
              <button
                key={s}
                type="button"
                className={`chip-toggle chip-toggle--tall ${on ? "chip-toggle--on" : ""}`}
                aria-pressed={on}
                onClick={() => setSelection(s)}
              >
                <span className="chip-toggle__main">
                  <span aria-hidden="true">{m.emoji}</span> {tx(m.label)}
                </span>
                <span className="chip-toggle__hint">{tx(m.hint)}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {!editing && (
        <label className="cat-field">
          <span className="cat-field__label">{tx("Opções iniciais (uma por linha, opcional)")}</span>
          <textarea
            className="cat-input cat-input--area"
            rows={4}
            placeholder={tx("Ônibus da igreja\nCarro próprio\nCarona")}
            value={optionsText}
            onChange={(e) => setOptionsText(e.target.value)}
          />
        </label>
      )}

      {error && <p className="message message--error">{error}</p>}

      <div className="cat-form__actions">
        <button type="button" className="button button--secondary" onClick={onCancel} disabled={busy}>
          {tx("Cancelar")}
        </button>
        <button type="submit" className="button button--primary" disabled={!valid || busy}>
          {busy ? tx("Salvando…") : editing ? tx("Salvar") : tx("Criar categoria 🎉")}
        </button>
      </div>
    </form>
  );
}
