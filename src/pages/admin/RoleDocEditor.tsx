import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { updateRole, type ScheduleRole } from "../../api/schedule";
import RichTextEditor from "../../components/RichTextEditor";
import { ICONS } from "../../icons";
import { useI18n } from "../../i18n";

export type RoleDocField = "instructions" | "preparation";

interface RoleDocEditorProps {
  token: string;
  role: ScheduleRole;
  field: RoleDocField;
  context?: string;
  onClose: () => void;
}

export default function RoleDocEditor({ token, role, field, context, onClose }: RoleDocEditorProps) {
  const { tx, te } = useI18n();
  const meta: Record<RoleDocField, { label: ReactNode; placeholder: string; aiContext: "role_instructions" | "role_preparation" }> = {
    instructions: {
      label: tx("📝 Instruções para a equipe"),
      placeholder: tx("ex.: Fique dentro da área da piscina durante todo o turno…"),
      aiContext: "role_instructions",
    },
    preparation: {
      label: <><img className="audience-icon" src={ICONS.preparation} alt="" aria-hidden="true" /> {tx("Preparação (antes do acampamento)")}</>,
      placeholder: tx("ex.: Leve uma camiseta verde e um boné — quanto mais parecido com o exército, melhor! 🥣"),
      aiContext: "role_preparation",
    },
  };
  const fieldMeta = meta[field];
  const [html, setHtml] = useState(role[field] ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = html !== (role[field] ?? "");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      cancel();
    };
    window.addEventListener("keydown", onKey);
    // scroll lock by class (styles.scss `body.scroll-locked`); an outer lock stays when this one closes
    const wasLocked = document.body.classList.contains("scroll-locked");
    document.body.classList.add("scroll-locked");
    return () => {
      window.removeEventListener("keydown", onKey);
      if (!wasLocked) document.body.classList.remove("scroll-locked");
    };
  });

  function cancel() {
    if (saving) return;
    if (dirty && !window.confirm(tx("Descartar o que você escreveu?"))) return;
    onClose();
  }

  async function save() {
    if (saving) return;
    if (!dirty) return onClose();
    setSaving(true);
    setError(null);
    try {
      await updateRole(token, role.id, { [field]: html });
      onClose();
    } catch (err) {
      setError(te(err, "Não foi possível salvar."));
      setSaving(false);
    }
  }

  const kind = field === "preparation" ? tx("Preparação") : tx("Instruções");

  return createPortal(
    <div className="doc-edit" role="dialog" aria-modal="true" aria-label={tx("{kind} — {name}", { kind, name: role.name })}>
      <header className="doc-edit__head">
        <div className="doc-edit__titles">
          <span className="doc-edit__title">
            <span aria-hidden="true">{role.emoji}</span> {role.name}
          </span>
          <span className="doc-edit__sub">
            {fieldMeta.label}
            {context ? ` · ${context}` : ""}
          </span>
        </div>
        <div className="doc-edit__actions">
          <button type="button" className="button button--secondary" disabled={saving} onClick={cancel}>
            {tx("Cancelar")}
          </button>
          <button type="button" className="button button--primary" disabled={saving} onClick={save}>
            {saving ? tx("Salvando…") : tx("Concluir")}
          </button>
        </div>
      </header>
      {error && <p className="message message--error doc-edit__error">{error}</p>}
      <div className="doc-edit__body">
        <RichTextEditor
          token={token}
          value={html}
          onChange={setHtml}
          disabled={saving}
          tall
          autoOpenAi
          onDone={save}
          doneBusy={saving}
          aiContext={fieldMeta.aiContext}
          aiTitle={role.name}
          onAiApplied={setHtml}
          placeholder={fieldMeta.placeholder}
        />
      </div>
    </div>,
    document.body,
  );
}
