import { useConfirm } from "../../components/ConfirmDialog";
import { useState } from "react";
import type { Category, CategoryOption } from "../../api/categories";
import { collatorLocale, useI18n } from "../../i18n";

interface CategoryOptionsProps {
  category: Category;
  busy?: boolean;
  onAdd: (label: string) => Promise<void>;
  onRename: (option: CategoryOption, label: string) => Promise<void>;
  onToggle: (option: CategoryOption) => Promise<void>;
  onDelete: (option: CategoryOption) => Promise<void>;
  onMove: (option: CategoryOption, direction: -1 | 1) => Promise<void>;
}

/** The enumeration values of one category: add / rename / hide / delete / reorder. */
export default function CategoryOptions({
  category,
  busy,
  onAdd,
  onRename,
  onToggle,
  onDelete,
  onMove,
}: CategoryOptionsProps) {
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();
  const { tx, te } = useI18n();

  async function run(fn: () => Promise<void>) {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(te(err, "Algo deu errado."));
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const label = draft.trim();
    if (!label) return;
    await run(async () => {
      await onAdd(label);
      setDraft("");
    });
  }

  function startEdit(o: CategoryOption) {
    setEditingId(o.id);
    setEditingLabel(o.label);
  }

  async function commitEdit(o: CategoryOption) {
    const label = editingLabel.trim();
    if (!label || label === o.label) {
      setEditingId(null);
      return;
    }
    await run(async () => {
      await onRename(o, label);
      setEditingId(null);
    });
  }

  const options = category.options;

  return (
    <div className="opt-list">
      <form className="opt-add" onSubmit={handleAdd}>
        <input
          className="cat-input"
          placeholder={tx("Nova opção de {name}…", { name: category.name.toLocaleLowerCase(collatorLocale()) })}
          value={draft}
          maxLength={80}
          disabled={busy}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" className="button button--primary opt-add__btn" disabled={busy || !draft.trim()}>
          + {tx("Adicionar")}
        </button>
      </form>

      {error && <p className="message message--error">{error}</p>}

      {options.length === 0 ? (
        <p className="opt-empty">{tx("Nenhuma opção ainda. Adicione a primeira acima! 🌱")}</p>
      ) : (
        <ol className="opt-items">
          {options.map((o, i) => (
            <li key={o.id} className={`opt-item ${o.active ? "" : "opt-item--inactive"}`}>
              <span className="opt-item__num">{i + 1}</span>

              {editingId === o.id ? (
                <input
                  className="cat-input opt-item__edit"
                  value={editingLabel}
                  maxLength={80}
                  autoFocus
                  onChange={(e) => setEditingLabel(e.target.value)}
                  onBlur={() => commitEdit(o)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitEdit(o);
                    }
                    if (e.key === "Escape") setEditingId(null);
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="opt-item__label"
                  title={tx("Clique para renomear")}
                  onClick={() => startEdit(o)}
                  disabled={busy}
                >
                  {o.label}
                  {!o.active && <span className="opt-item__badge">{tx("oculta")}</span>}
                </button>
              )}

              <div className="opt-item__actions">
                <button
                  type="button"
                  className="icon-btn"
                  title={tx("Mover para cima")}
                  disabled={busy || i === 0}
                  onClick={() => run(() => onMove(o, -1))}
                >
                  ▲
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  title={tx("Mover para baixo")}
                  disabled={busy || i === options.length - 1}
                  onClick={() => run(() => onMove(o, 1))}
                >
                  ▼
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  title={o.active ? tx("Ocultar dos formulários") : tx("Mostrar nos formulários")}
                  disabled={busy}
                  onClick={() => run(() => onToggle(o))}
                >
                  {o.active ? "👁️" : "🙈"}
                </button>
                <button
                  type="button"
                  className="icon-btn icon-btn--danger"
                  title={tx("Excluir")}
                  disabled={busy}
                  onClick={async () => {
                    if (await confirm({ emoji: "🗑️", title: tx('Excluir a opção "{name}"?', { name: o.label }), confirmLabel: tx("Excluir"), danger: true })) run(() => onDelete(o));
                  }}
                >
                  🗑️
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}

      <p className="cat-hint">
        {tx("💡 Em vez de excluir uma opção já usada,")} <strong>{tx("oculte")}</strong>{" "}
        {tx("(👁️): os cadastros antigos continuam válidos.")}
      </p>
    </div>
  );
}
