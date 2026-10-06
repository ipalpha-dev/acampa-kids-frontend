import { useState } from "react";
import { createPrepSection, deletePrepSection, reorderPrepSections, updatePrepSection, type PrepSection, type PrepSectionInput } from "../../api/preparation";
import { useConfirm } from "../../components/ConfirmDialog";
import EmojiPicker from "../../components/EmojiPicker";
import { PrepAudiencePicker, PrepAudienceTags, type PrepAudience } from "../../components/AudiencePicker";
import { useAiAutoFill } from "../../hooks/useAiAutoFill";
import AiTitleButton from "../../components/AiTitleButton";
import RichHtml from "../../components/RichHtml";
import RichTextEditor from "../../components/RichTextEditor";
import Breadcrumbs from "../../components/Breadcrumbs";
import { goBack, useRoute } from "../../router";
import { useCollection, useCollectionOrEmpty } from "../../store";
import { ICONS } from "../../icons";
import { AiGlyph } from "../../components/Glyph";
import { useI18n } from "../../i18n";

interface PreparationAdminPageProps {
  token: string;
}

const EMOJI_SUGGESTIONS = ["📌", "🎒", "👕", "🧢", "🧴", "💊", "⛪", "🚌", "🕐", "📱", "💤", "🍽️", "🌧️", "☀️", "🙏", "📸", "🧸", "🩹"];

/**
 * ⚙️ → Preparação: the general sections read before the camp, each POSTED
 * to the parents and/or the room caretakers and/or the helpers. Each section
 * is a title + emoji + rich text (with pictures). Role
 * specific preparation ("Inspetor: roupa verde") is written on the role
 * itself (Programação → Funções).
 *
 *   /preparation            list          /preparation/new        new section
 *   /preparation/:id/edit   edit section
 */
export default function PreparationAdminPage({ token }: PreparationAdminPageProps) {
  const { tx, te } = useI18n();
  const sections = useCollection("preparation");
  const { segments, navigate } = useRoute();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [, id, action] = segments;
  const mode: { kind: "list" } | { kind: "new" } | { kind: "edit"; id: string } =
    id === "new" ? { kind: "new" } : id && action === "edit" ? { kind: "edit", id } : { kind: "list" };

  async function withBusy<T>(fn: () => Promise<T>): Promise<T> {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError(te(err, "Algo deu errado."));
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate(input: PrepSectionInput) {
    await withBusy(() => createPrepSection(token, input));
    navigate("/preparation", { replace: true });
  }
  async function handleEdit(s: PrepSection, input: PrepSectionInput) {
    await withBusy(() => updatePrepSection(token, s.id, input));
    navigate("/preparation", { replace: true });
  }
  async function handleDelete(s: PrepSection) {
    if (!(await confirm({ emoji: "🗑️", title: tx('Excluir a comunicação "{title}"?', { title: s.title }), message: tx("Isso não pode ser desfeito."), confirmLabel: tx("Excluir"), danger: true }))) return;
    await withBusy(() => deletePrepSection(token, s.id)).catch(() => {});
    navigate("/preparation", { replace: true });
  }
  async function move(s: PrepSection, dir: -1 | 1) {
    if (!sections) return;
    const ids = sections.map((x) => x.id);
    const i = ids.indexOf(s.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await withBusy(() => reorderPrepSections(token, ids)).catch(() => {});
  }

  if (!sections) {
    return (
      <div className="admin-page">
        {error ? <p className="message message--error">{error}</p> : <p className="opt-empty">{tx("Sincronizando com o servidor… 🏕️")}</p>}
      </div>
    );
  }

  const editing = mode.kind === "edit" ? sections.find((s) => s.id === mode.id) : undefined;
  const cancel = () => goBack("/preparation");

  return (
    <div className="admin-page">
      {mode.kind !== "list" && (
        <Breadcrumbs items={[{ label: tx("Preparação"), onClick: () => navigate("/preparation") }, ...(editing ? [{ label: editing.title }] : []), { label: mode.kind === "new" ? tx("Nova comunicação") : tx("Editar") }]} />
      )}
      <header className="admin-head">
        <h1 className="admin-title">{mode.kind === "new" ? <><img className="admin-title__icon" src={ICONS.preparation} alt="" aria-hidden="true" /> {tx("Nova comunicação")}</> : mode.kind === "edit" ? tx("✏️ Editar comunicação") : <><img className="admin-title__icon" src={ICONS.preparation} alt="" aria-hidden="true" /> {tx("Preparação")}</>}</h1>
        {mode.kind === "list" && (
          <button type="button" className="button button--primary admin-head__new" disabled={busy} onClick={() => navigate("/preparation/new")}>
            {tx("+ Comunicação")}
          </button>
        )}
        {mode.kind === "edit" && editing && (
          <button
            type="button"
            className="icon-btn icon-btn--lg icon-btn--danger"
            title={tx('Excluir comunicação "{title}"', { title: editing.title })}
            aria-label={tx('Excluir comunicação "{title}"', { title: editing.title })}
            disabled={busy}
            onClick={() => handleDelete(editing)}
          >
            🗑️
          </button>
        )}
      </header>

      {mode.kind === "list" && (
        <>
          <p className="admin-intro">
            {tx("O que a equipe e os pais precisam saber, levar e vestir")} <strong>{tx("antes")}</strong> {tx("do acampamento.")}
          </p>
          <p className="cat-hint">
            {tx("🎯 A preparação")} <strong>{tx("por função")}</strong> {tx("(ex.: “Inspeção: roupa verde estilo exército com boné”) é escrita na própria função da programação.")}{" "}
            <button type="button" className="link-btn" onClick={() => navigate("/schedule/roles")}>
              {tx("Ver Programação → Funções")}
            </button>
          </p>
        </>
      )}

      {error && <p className="message message--error">{error}</p>}

      {mode.kind === "new" && <SectionForm token={token} busy={busy} onSubmit={handleCreate} onCancel={cancel} />}
      {mode.kind === "edit" && !editing && <p className="opt-empty">{tx("Comunicação não encontrada.")}</p>}
      {mode.kind === "edit" && editing && (
        <SectionForm key={editing.id} token={token} section={editing} busy={busy} onSubmit={(i) => handleEdit(editing, i)} onCancel={cancel} />
      )}

      {mode.kind === "list" && sections.length === 0 && (
        <div className="admin-empty">
          <img className="admin-empty__icon" src={ICONS.preparation} alt="" aria-hidden="true" />
          <p>{tx("Nenhuma comunicação ainda. Comece com “O que levar”, “Chegada na igreja” ou “Uniforme da equipe”.")}</p>
          <button type="button" className="button button--primary" onClick={() => navigate("/preparation/new")}>
            {tx("+ Criar comunicação")}
          </button>
        </div>
      )}

      {mode.kind === "list" && sections.length > 0 && (
        <div className="prep-sections">
          {sections.map((s, i) => (
            <article key={s.id} className="detail-card prep-section prep-section--admin">
              <header className="prep-section__head prep-section__head--admin">
                <h3 className="prep-section__title">
                  <span aria-hidden="true">{s.emoji}</span> {s.title}
                </h3>
                <div className="opt-item__actions">
                  <button type="button" className="icon-btn" title={tx("Subir")} aria-label={tx("Subir")} disabled={busy || i === 0} onClick={() => move(s, -1)}>
                    ↑
                  </button>
                  <button type="button" className="icon-btn" title={tx("Descer")} aria-label={tx("Descer")} disabled={busy || i === sections.length - 1} onClick={() => move(s, 1)}>
                    ↓
                  </button>
                  <button type="button" className="icon-btn" title={tx("Editar")} aria-label={tx("Editar")} disabled={busy} onClick={() => navigate(`/preparation/${s.id}/edit`)}>
                    <span className="pencil" aria-hidden="true">✏️</span>
                  </button>
                </div>
              </header>
              {/* who receives it — second line: all the pills together, wrapping only when they don't fit */}
              <div className="prep-section__audiences">
                <PrepAudienceTags audiences={s.audiences} />
              </div>
              {s.content ? <RichHtml html={s.content} /> : <p className="opt-empty">{tx("Sem conteúdo.")}</p>}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

interface SectionFormProps {
  token: string;
  section?: PrepSection;
  busy: boolean;
  onSubmit: (input: PrepSectionInput) => Promise<void>;
  onCancel: () => void;
}

function SectionForm({ token, section, busy, onSubmit, onCancel }: SectionFormProps) {
  const { tx } = useI18n();
  const [title, setTitle] = useState(section?.title ?? "");
  const [emoji, setEmoji] = useState(section?.emoji ?? "📌");
  const [audiences, setAudiences] = useState<PrepAudience[]>(section?.audiences ?? ["caretaker", "helper"]);
  const [content, setContent] = useState(section?.content ?? "");
  const valid = title.trim().length > 0 && audiences.length > 0;
  const ai = useAiAutoFill({ token, context: "preparation", title, setTitle, emoji, setEmoji, defaultEmoji: "📌", emojiSuggestions: EMOJI_SUGGESTIONS, existing: !!section, html: content });

  return (
    <form
      className="cat-form cat-form--plain"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && !busy) void onSubmit({ title: title.trim(), emoji: emoji.trim() || "📌", audiences, content }).catch(() => {});
      }}
    >
      <div className="cat-form__row">
        <div className="cat-field cat-field--emoji">
          <span className="cat-field__label">{tx("Ícone")}</span>
          <EmojiPicker value={emoji} onChange={ai.pickEmoji} suggestions={EMOJI_SUGGESTIONS} disabled={busy} guessing={ai.suggestingEmoji} />
        </div>
        <label className="cat-field cat-field--grow">
          <span className="cat-field__label">{tx("Título")}{ai.suggesting && <span className="cat-field__ai"> <AiGlyph /> {tx("sugerindo…")}</span>}</span>
          <span className="cat-input-wrap">
            <input className="cat-input" placeholder={tx("ex.: O que levar na mala")} value={title} maxLength={80} autoFocus disabled={busy} onChange={(e) => setTitle(e.target.value)} />
            <AiTitleButton html={content} busy={ai.suggesting} disabled={busy} onClick={() => void ai.regenerateTitle(content)} />
          </span>
        </label>
      </div>
      <PrepAudiencePicker value={audiences} onChange={setAudiences} disabled={busy} />
      <div className="cat-field">
        <span className="cat-field__label">{tx("📝 Conteúdo")}</span>
        <p className="cat-hint">{tx("Texto, listas, links e fotos (🖼️ ou cole / arraste uma imagem).")}</p>
        <RichTextEditor token={token} value={content} onChange={setContent} disabled={busy} placeholder={tx("ex.: Leve roupa de banho, toalha, protetor solar…")} aiContext="preparation" aiTitle={title} onAiApplied={ai.onAiApplied} />
      </div>
      <div className="cat-form__actions">
        <button type="button" className="button button--secondary" onClick={onCancel} disabled={busy}>
          {tx("Cancelar")}
        </button>
        <button type="submit" className="button button--primary" disabled={!valid || busy}>
          {busy ? tx("Salvando…") : section ? tx("Salvar") : tx("Criar comunicação 🎉")}
        </button>
      </div>
    </form>
  );
}
