import { useState, type ReactNode } from "react";
import EmojiPicker from "../../components/EmojiPicker";
import { useAiAutoFill } from "../../hooks/useAiAutoFill";
import AiTitleButton from "../../components/AiTitleButton";
import type { ScheduleRole, ScheduleRoleInput } from "../../api/schedule";
import { ROOM_ROLE_META, type RoomRole } from "../../api/staff";
import RichTextEditor from "../../components/RichTextEditor";
import Toggle from "../../components/Toggle";
import { AiGlyph } from "../../components/Glyph";
import { ICONS } from "../../icons";
import { useHideScanFab } from "../../scanFab";
import { useI18n } from "../../i18n";

const EMOJI_SUGGESTIONS = ["🎯", "🧒", "🏊", "🔍", "📻", "🧹", "🏆", "📋", "😈", "🎨", "🃏", "🚩", "🚶", "🪑", "🏖️", "⛑️", "🎤", "📸"];

interface RoleFormProps {
  token: string;
  role?: ScheduleRole;
  busy?: boolean;
  onSubmit: (input: ScheduleRoleInput) => Promise<void>;
  onCancel: () => void;
  embedded?: boolean;
  hideDocs?: boolean;
}

export default function RoleForm({ token, role, busy, onSubmit, onCancel, embedded, hideDocs }: RoleFormProps) {
  useHideScanFab();
  const { tx, te } = useI18n();
  const editing = !!role;
  const [name, setName] = useState(role?.name ?? "");
  const [emoji, setEmoji] = useState(role?.emoji ?? "🎯");
  const [instructions, setInstructions] = useState(role?.instructions ?? "");
  const [preparation, setPreparation] = useState(role?.preparation ?? "");
  const [forRoomRoles, setForRoomRoles] = useState<RoomRole[]>(role?.forRoomRoles ?? []);
  const [hasDetail, setHasDetail] = useState(role?.hasDetail ?? false);
  const [detailFromTeam, setDetailFromTeam] = useState(role?.detailFromTeam ?? false);
  const [detailPlaceholder, setDetailPlaceholder] = useState(role?.detailPlaceholder ?? "");
  const [error, setError] = useState<string | null>(null);

  const valid = name.trim().length > 0;
  const byPosition = forRoomRoles.length > 0;
  const ai = useAiAutoFill({
    token,
    context: "role_instructions",
    title: name,
    setTitle: setName,
    emoji,
    setEmoji,
    defaultEmoji: "🎯",
    emojiSuggestions: EMOJI_SUGGESTIONS,
    existing: editing,
    html: [instructions, preparation].filter(Boolean).join("\n"),
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!valid) return;
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        emoji: emoji.trim() || "🎯",
        instructions,
        preparation,
        forRoomRoles,
        hasDetail: byPosition ? false : hasDetail,
        detailFromTeam: !byPosition && hasDetail ? detailFromTeam : false,
        detailPlaceholder: byPosition || !hasDetail || detailFromTeam ? "" : detailPlaceholder.trim(),
      });
    } catch (err) {
      setError(te(err, "Algo deu errado."));
    }
  }

  return (
    <form className={embedded ? "cat-form cat-form--embedded" : "cat-form cat-form--plain"} onSubmit={handleSubmit}>
      {embedded && <span className="sheet__handle" aria-hidden="true" />}
      {embedded && <h2 className="cat-form__title change-room__title">{editing ? tx("Editar função") : tx("Nova função")}</h2>}

      <div className="cat-form__row">
        <div className="cat-field cat-field--emoji">
          <span className="cat-field__label">{tx("Ícone")}</span>
          <EmojiPicker value={emoji} onChange={ai.pickEmoji} suggestions={EMOJI_SUGGESTIONS} disabled={busy} guessing={ai.suggestingEmoji} />
        </div>
        <label className="cat-field cat-field--grow">
          <span className="cat-field__label">{tx("Nome")}{ai.suggesting && <span className="cat-field__ai"> <AiGlyph /> {tx("sugerindo…")}</span>}</span>
          <span className="cat-input-wrap">
            <input
              className="cat-input"
              placeholder={tx("ex.: Supervisão da piscina")}
              value={name}
              maxLength={80}
              autoFocus
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
            />
            <AiTitleButton html={instructions || preparation} busy={ai.suggesting} disabled={busy} onClick={() => void ai.regenerateTitle(instructions || preparation)} />
          </span>
        </label>
      </div>

      <section className="form-box form-box--plain" aria-labelledby="role-options-title">
        <h3 id="role-options-title" className="form-box__title">{tx("⚙️ Quem faz esta função")}</h3>

        <RolePositionsPicker value={forRoomRoles} onChange={setForRoomRoles} disabled={busy} />

        <Reveal open={!byPosition}>
          <div className="cat-field opt-field">
            <div className="opt-field__head">
              <Toggle checked={hasDetail} onChange={setHasDetail} disabled={busy || byPosition} label={tx("🏷️ Tem um detalhe por pessoa")} />
            </div>
            <Reveal open={hasDetail && !byPosition}>
              <div className="opt-field__head">
                <Toggle checked={detailFromTeam} onChange={setDetailFromTeam} disabled={busy || byPosition} label={tx("🚩 O detalhe é o time da pessoa")} />
              </div>
              <Reveal open={!detailFromTeam}>
                <label className="cat-field">
                  <span className="cat-field__label">{tx("Dica do detalhe (aparece no campo)")}</span>
                  <input
                    className="cat-input"
                    placeholder={tx("ex.: Base 3 · 14h–14h45")}
                    value={detailPlaceholder}
                    maxLength={60}
                    disabled={busy || byPosition}
                    onChange={(e) => setDetailPlaceholder(e.target.value)}
                  />
                </label>
              </Reveal>
            </Reveal>
          </div>
        </Reveal>
      </section>

      {!hideDocs && (
      <>
      <section className="form-box form-box--plain" aria-labelledby="role-instructions-title">
        <h3 id="role-instructions-title" className="form-box__title">{tx("📝 Instruções para a equipe")}</h3>
        <p className="cat-hint">{tx("O que a pessoa nesta função precisa fazer.")}</p>
        <RichTextEditor
          token={token}
          aiContext="role_instructions"
          aiTitle={name}
          onAiApplied={ai.onAiApplied}
          value={instructions}
          onChange={setInstructions}
          disabled={busy}
          placeholder={tx("ex.: Fique dentro da área da piscina durante todo o turno…")}
        />
      </section>

      <section className="form-box form-box--plain" aria-labelledby="role-prep-title">
        <h3 id="role-prep-title" className="form-box__title"><img className="admin-title__icon" src={ICONS.preparation} alt="" aria-hidden="true" /> {tx("Preparação (antes do acampamento)")}</h3>
        <p className="cat-hint">
          {tx("O que quem faz esta função precisa")} <strong>{tx("levar, vestir ou preparar")}</strong> {tx("— ex.: “roupa verde estilo exército com boné”.")}
        </p>
        <RichTextEditor
          token={token}
          aiContext="role_preparation"
          aiTitle={name}
          onAiApplied={ai.onAiApplied}
          value={preparation}
          onChange={setPreparation}
          disabled={busy}
          placeholder={tx("ex.: Leve uma camiseta verde e um boné — quanto mais parecido com o exército, melhor! 🥣")}
        />
      </section>
      </>
      )}

      {error && <p className="message message--error">{error}</p>}

      <div className="cat-form__actions">
        <button type="button" className="button button--secondary" onClick={onCancel} disabled={busy}>
          {tx("Cancelar")}
        </button>
        <button type="submit" className="button button--primary" disabled={!valid || busy}>
          {busy ? tx("Salvando…") : editing ? tx("Salvar") : tx("Criar função 🎉")}
        </button>
      </div>
    </form>
  );
}

function Reveal({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div className={`reveal${open ? " reveal--open" : ""}`} aria-hidden={!open} inert={!open || undefined}>
      <div className="reveal__inner">{children}</div>
    </div>
  );
}

function RolePositionsPicker({ value, onChange, disabled }: { value: RoomRole[]; onChange: (v: RoomRole[]) => void; disabled?: boolean }) {
  const { tx } = useI18n();
  const whoOptions: { key: string; roles: RoomRole[]; label: string; icon: string; hint: string }[] = [
    { key: "picked", roles: [], label: tx("Pessoas específicas"), icon: ICONS.organizer, hint: tx("escolhidas por você") },
    { key: "caretaker", roles: ["caretaker"], label: ROOM_ROLE_META.caretaker.plural, icon: ROOM_ROLE_META.caretaker.icon!, hint: tx("quem cuida de crianças") },
    { key: "helper", roles: ["helper"], label: ROOM_ROLE_META.helper.plural, icon: ROOM_ROLE_META.helper.icon!, hint: tx("os auxiliares de quarto") },
    { key: "all", roles: ["caretaker", "helper"], label: tx("Toda a equipe"), icon: ICONS.staffPair, hint: tx("líderes e auxiliares") },
  ];
  const current = whoOptions.find((o) => o.roles.length === value.length && o.roles.every((r) => value.includes(r))) ?? whoOptions[0];
  return (
    <fieldset className="cat-fieldset" aria-label={tx("Quem faz esta função")}>
      <div className="big-options big-options--row">
        {whoOptions.map((o) => {
          const on = o.key === current.key;
          return (
            <button
              key={o.key}
              type="button"
              className={`big-option ${on ? "big-option--on" : ""}`}
              aria-pressed={on}
              disabled={disabled}
              onClick={() => onChange(o.roles)}
            >
              <span className="big-option__emoji" aria-hidden="true">
                <img className="audience-icon audience-icon--32" src={o.icon} alt="" />
              </span>
              <span className="big-option__label">{o.label}</span>
              <span className="big-option__hint">{o.hint}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
