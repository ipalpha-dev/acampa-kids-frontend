import { useEffect, useMemo, useRef, useState } from "react";
import { createRole, type ScheduleRole, type ScheduleRoleInput } from "../../api/schedule";
import AutoRoleBadge from "../../components/AutoRoleBadge";
import Dialog from "../../components/Dialog";
import SearchField from "../../components/SearchField";
import RoleForm from "./RoleForm";
import { ICONS } from "../../icons";
import { collatorLocale, useI18n } from "../../i18n";

interface AddRoleDialogProps {
  token: string;
  open: boolean;
  roles: ScheduleRole[];
  excludeIds: string[];
  where: string;
  onAdd: (roleId: string) => Promise<void> | void;
  onClose: () => void;
}

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export default function AddRoleDialog({ token, open, roles, excludeIds, where, onAdd, onClose }: AddRoleDialogProps) {
  const { tx } = useI18n();
  const [step, setStep] = useState<"choice" | "pick" | "create">("choice");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setStep("choice");
    setQ("");
    setError(null);
  }, [open]);

  useEffect(() => {
    if (open && step === "pick") setTimeout(() => inputRef.current?.focus(), 50);
  }, [open, step]);

  const available = useMemo(() => {
    const here = new Set(excludeIds);
    const nq = normalize(q.trim());
    return roles
      .filter((r) => !here.has(r.id) && (!nq || normalize(r.name).includes(nq)))
      .sort((a, b) => a.name.localeCompare(b.name, collatorLocale(), { sensitivity: "base" }));
  }, [roles, excludeIds, q]);

  const alreadyHere = roles.length - roles.filter((r) => !excludeIds.includes(r.id)).length;

  async function add(roleId: string) {
    setBusy(true);
    setError(null);
    try {
      await onAdd(roleId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : tx("Algo deu errado."));
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate(input: ScheduleRoleInput) {
    setBusy(true);
    setError(null);
    try {
      const created = await createRole(token, input);
      await onAdd(created.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : tx("Algo deu errado."));
    } finally {
      setBusy(false);
    }
  }

  const closeAll = () => {
    if (!busy) onClose();
  };

  return (
    <>
      <Dialog open={open && step === "choice"} onClose={closeAll} title={tx("Adicionar função")} width={520} className="sheet-dialog">
        <div className="cat-form cat-form--embedded">
          <span className="sheet__handle" aria-hidden="true" />
          <h2 className="cat-form__title change-room__title">{tx("🎯 Adicionar função")}</h2>
          <p className="cat-hint">{where}</p>
          <div className="big-options">
            <button type="button" className="big-option" disabled={busy} onClick={() => setStep("pick")}>
              <span className="big-option__emoji" aria-hidden="true">
                <img className="option-icon-34" src={ICONS.chooseExisting} alt="" />
              </span>
              <span className="big-option__label">{tx("Escolher existente")}</span>
              <span className="big-option__hint">{tx("do catálogo de funções do acampamento")}</span>
            </button>
            <button type="button" className="big-option" disabled={busy} onClick={() => setStep("create")}>
              <span className="big-option__emoji" aria-hidden="true">
                <img className="option-icon-34" src={ICONS.createNew} alt="" />
              </span>
              <span className="big-option__label">{tx("Criar nova")}</span>
              <span className="big-option__hint">{tx("instruções e preparação ficam para depois")}</span>
            </button>
          </div>
          {error && <p className="message message--error">{error}</p>}
          <div className="cat-form__actions">
            <button type="button" className="button button--secondary" disabled={busy} onClick={onClose}>
              {tx("Cancelar")}
            </button>
          </div>
        </div>
      </Dialog>

      <Dialog open={open && step === "pick"} onClose={closeAll} title={tx("Escolher função")} width={520} autofocus className="picker-sheet-dialog">
        <div className="picker picker-sheet">
          <header className="picker-sheet__head">
            <span className="picker-sheet__handle" aria-hidden="true" />
            <h2 className="cat-form__title">{tx("🎯 Escolher função existente")}</h2>
            <p className="cat-hint">{where}</p>
            <SearchField
              inputRef={inputRef}
              placeholder={tx("Buscar função…")}
              value={q}
              disabled={busy}
              onChange={setQ}
              aria-label={tx("Buscar função")}
            />
            {error && <p className="message message--error">{error}</p>}
          </header>

          <div className="picker-sheet__body">
            {available.length === 0 ? (
              <p className="opt-empty">
                {roles.length === 0
                  ? tx("Nenhuma função cadastrada ainda.")
                  : q.trim()
                    ? tx("Nenhuma função com esse nome.")
                    : tx("Todas as funções já estão aqui.")}
              </p>
            ) : (
              <ul className="picker__list" role="listbox">
                {available.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={false}
                      className="picker__item"
                      disabled={busy}
                      onClick={() => add(r.id)}
                    >
                      <span className="picker__name">
                        <span aria-hidden="true">{r.emoji}</span> {r.name}
                      </span>
                      <span className="picker__tags">
                        <AutoRoleBadge role={r} />
                        {r.detailFromTeam && <span className="slot-item__badge">{tx("🚩 detalhe = time")}</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {alreadyHere > 0 && (
              <p className="cat-hint">
                {alreadyHere === 1 ? tx("1 função já está aqui.") : tx("{n} funções já estão aqui.", { n: alreadyHere })}
              </p>
            )}
          </div>

          <div className="cat-form__actions picker-sheet__actions">
            <button type="button" className="button button--secondary" disabled={busy} onClick={() => setStep("choice")}>
              {tx("‹ Voltar")}
            </button>
            <button type="button" className="button button--primary" disabled={busy} onClick={() => setStep("create")}>
              {tx("+ Criar nova")}
            </button>
          </div>
        </div>
      </Dialog>

      <Dialog open={open && step === "create"} onClose={() => !busy && setStep("choice")} title={tx("Nova função")} width={680} dismissible={false} className="sheet-dialog role-sheet">
        <RoleForm embedded hideDocs token={token} busy={busy} onSubmit={handleCreate} onCancel={() => setStep("choice")} />
      </Dialog>
    </>
  );
}
