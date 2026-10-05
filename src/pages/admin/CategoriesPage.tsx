import { useConfirm } from "../../components/ConfirmDialog";
import { useState } from "react";
import { goBack, useRoute } from "../../router";
import { useCollection } from "../../store";
import {
  AUDIENCE_META,
  SELECTION_META,
  addOption,
  createCategory,
  deleteCategory,
  deleteOption,
  reorderCategories,
  reorderOptions,
  updateCategory,
  updateOption,
  type Category,
  type CategoryInput,
  type CategoryOption,
} from "../../api/categories";
import AudienceIcon from "../../components/AudienceIcon";
import CategoryForm from "./CategoryForm";
import CategoryOptions from "./CategoryOptions";
import { useI18n } from "../../i18n";

interface CategoriesPageProps {
  token: string;
}

/** URL → what to show:  /categories · /categories/new · /categories/:id · /categories/:id/edit */
type Mode = { kind: "view" } | { kind: "create" } | { kind: "edit"; id: string };
function modeOf(segments: string[]): { mode: Mode; selectedId: string | null } {
  const [, id, action] = segments;
  if (!id) return { mode: { kind: "view" }, selectedId: null };
  if (id === "new") return { mode: { kind: "create" }, selectedId: null };
  if (action === "edit") return { mode: { kind: "edit", id }, selectedId: id };
  return { mode: { kind: "view" }, selectedId: id };
}

/**
 * Admin-only: manage the categories (closed enumerations) that feed the
 * camper and staff forms. One tab per category; each tab lists its options.
 */
export default function CategoriesPage({ token }: CategoriesPageProps) {
  // from the local store (localStorage + live WebSocket feed); writes patch it through api/categories.ts
  const categories = useCollection("categories");
  const { segments, navigate } = useRoute();
  const { mode, selectedId: routeId } = modeOf(segments);
  const confirm = useConfirm();
  const { tx, te } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // no category in the URL (or an unknown one) → the first one; but never "guess" what to edit
  const exact = categories?.find((c) => c.id === routeId) ?? null;
  const selected = exact ?? (mode.kind === "edit" ? null : (categories?.[0] ?? null));
  const selectedId = selected?.id ?? null;

  /** the api layer already upserts the returned category into the store */
  function patchLocal(_updated: Category) {}

  async function withBusy<T>(fn: () => Promise<T>): Promise<T> {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } finally {
      setBusy(false);
    }
  }

  // ── category CRUD ──────────────────────────────────────────────────────

  async function handleCreate(input: CategoryInput) {
    const created = await withBusy(() => createCategory(token, input));
    navigate(`/categories/${created.id}`, { replace: true });
  }

  async function handleEdit(input: CategoryInput) {
    if (mode.kind !== "edit") return;
    const { options: _ignored, ...patch } = input;
    const updated = await withBusy(() => updateCategory(token, mode.id, patch));
    patchLocal(updated);
    navigate(`/categories/${updated.id}`, { replace: true });
  }

  async function handleDelete(cat: Category) {
    if (!(await confirm({ emoji: "🗑️", title: tx('Excluir a categoria "{name}"?', { name: cat.name }), message: tx("Suas {n} opções também serão excluídas. Isso não pode ser desfeito.", { n: cat.options.length }), confirmLabel: tx("Excluir"), danger: true }))) return;
    await withBusy(() => deleteCategory(token, cat.id)).catch((e) => setError(te(e)));
    navigate("/categories", { replace: true });
  }

  async function moveCategory(cat: Category, dir: -1 | 1) {
    if (!categories) return;
    const ids = categories.map((c) => c.id);
    const i = ids.indexOf(cat.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await withBusy(() => reorderCategories(token, ids)).catch((e) => setError(te(e)));
  }

  // ── option CRUD (delegated to CategoryOptions) ─────────────────────────

  const optionHandlers = selected
    ? {
        onAdd: async (label: string) => patchLocal(await withBusy(() => addOption(token, selected.id, label))),
        onRename: async (o: CategoryOption, label: string) =>
          patchLocal(await withBusy(() => updateOption(token, selected.id, o.id, { label }))),
        onToggle: async (o: CategoryOption) =>
          patchLocal(await withBusy(() => updateOption(token, selected.id, o.id, { active: !o.active }))),
        onDelete: async (o: CategoryOption) => patchLocal(await withBusy(() => deleteOption(token, selected.id, o.id))),
        onMove: async (o: CategoryOption, dir: -1 | 1) => {
          const ids = selected.options.map((x) => x.id);
          const i = ids.indexOf(o.id);
          const j = i + dir;
          if (j < 0 || j >= ids.length) return;
          [ids[i], ids[j]] = [ids[j], ids[i]];
          patchLocal(await withBusy(() => reorderOptions(token, selected.id, ids)));
        },
      }
    : null;

  // ── render ─────────────────────────────────────────────────────────────

  if (!categories) {
    return (
      <div className="admin-page">
        {error ? <p className="message message--error">{error}</p> : <p className="opt-empty">{tx("Sincronizando com o servidor… 🏕️")}</p>}
      </div>
    );
  }

  const categoryTabs = categories.length > 0 && (
    <nav className="cat-tabs cat-tabs--categories" role="tablist" aria-label={tx("Categorias")}>
      {categories.map((c) => {
        const active = c.id === selectedId && mode.kind === "view";
        return (
          <button
            key={c.id}
            role="tab"
            type="button"
            aria-selected={active}
            className={`cat-tab ${active ? "cat-tab--active" : ""}`}
            onClick={() => navigate(`/categories/${c.id}`)}
          >
            <span className="cat-tab__emoji" aria-hidden="true">{c.emoji}</span>
            <span>{c.name}</span>
            <span className="cat-tab__count">{c.options.filter((o) => o.active).length}</span>
          </button>
        );
      })}
    </nav>
  );

  return (
    <div className="admin-page admin-page--wide">
      <header className="admin-head">
        <h1 className="admin-title">{tx("Categorias")}</h1>
        <button
          type="button"
          className="button button--primary admin-head__new"
          disabled={busy}
          onClick={() => navigate("/categories/new")}
        >
          + {tx("Nova categoria")}
        </button>
      </header>

      {error && <p className="message message--error">{error}</p>}
      {categoryTabs}

      <div className="cat-main">
        {mode.kind === "create" && (
          <CategoryForm token={token} busy={busy} onSubmit={handleCreate} onCancel={() => goBack("/categories")} />
        )}
        {mode.kind === "edit" && !selected && <p className="opt-empty">{tx("Categoria não encontrada.")}</p>}
        {mode.kind === "edit" && selected && (
          <CategoryForm
            token={token}
            key={selected.id}
            category={selected}
            busy={busy}
            onSubmit={handleEdit}
            onCancel={() => goBack(`/categories/${selected.id}`)}
          />
        )}

        {mode.kind === "view" && categories.length === 0 && (
          <div className="admin-empty">
            <span className="admin-empty__emoji">🗂️</span>
            <p>
              {tx("Cada categoria é uma")} <strong>{tx("lista fechada de opções")}</strong>{" "}
              {tx("que aparece nos formulários de acampante e/ou equipe — cama, alergias, condições de saúde…")}
            </p>
            <button type="button" className="button button--primary" onClick={() => navigate("/categories/new")}>
              + {tx("Criar a primeira")}
            </button>
          </div>
        )}

        {mode.kind === "view" && selected && optionHandlers && (
          <section className="cat-panel" role="tabpanel">
            <div className="cat-panel__head">
                <div className="cat-panel__title">
                  <span className="cat-panel__emoji" aria-hidden="true">{selected.emoji}</span>
                  <div>
                    <h2>{selected.name}</h2>
                    {selected.description && <p className="cat-panel__desc">{selected.description}</p>}
                    <div className="cat-panel__meta">
                      {selected.appliesTo.map((a) => (
                        <span key={a} className="meta-chip meta-chip--audience">
                          <AudienceIcon audience={a} /> {tx(AUDIENCE_META[a].label)}
                        </span>
                      ))}
                      <span className="meta-chip">
                        {SELECTION_META[selected.selection].emoji} {tx(SELECTION_META[selected.selection].label)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="cat-panel__actions">
                  <button
                    type="button"
                    className="icon-btn"
                    title={tx("Mover para cima na lista")}
                    disabled={busy || categories[0].id === selected.id}
                    onClick={() => moveCategory(selected, -1)}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    title={tx("Mover para baixo na lista")}
                    disabled={busy || categories[categories.length - 1].id === selected.id}
                    onClick={() => moveCategory(selected, 1)}
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    title={tx("Editar categoria")}
                    disabled={busy}
                    onClick={() => navigate(`/categories/${selected.id}/edit`)}
                  >
                    <span className="pencil" aria-hidden="true">✏️</span>
                  </button>
                  <button
                    type="button"
                    className="icon-btn icon-btn--danger"
                    title={tx("Excluir categoria")}
                    disabled={busy}
                    onClick={() => handleDelete(selected)}
                  >
                    🗑️
                  </button>
                </div>
            </div>

            <CategoryOptions category={selected} busy={busy} {...optionHandlers} />
          </section>
        )}
      </div>
    </div>
  );
}
