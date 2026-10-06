import { useEffect, useState } from "react";
import { createCamp } from "../api/camps";
import { setWizardDismissed } from "../wizard/state";
import { useI18n } from "../i18n";
import Dialog from "./Dialog";
import { ICONS } from "../icons";

interface CreateCampDialogProps {
  open: boolean;
  token: string;
  /** the year picked defaults to the one right after this */
  currentYear: number;
  onClose: () => void;
  /** switches the session into the freshly created camp — the wizard opens by itself on an empty camp */
  onSwitchCamp: (campId: string) => Promise<void>;
}

/**
 * "Novo acampamento" sheet: Limpeza and the Superusuário page's Acampamentos
 * card both open this. Creating a camp makes it active right away (the
 * previous one is archived by the server); the caller's session follows it.
 */
export default function CreateCampDialog({ open, token, currentYear, onClose, onSwitchCamp }: CreateCampDialogProps) {
  const { tx, te } = useI18n();
  const nextYear = currentYear + 1;
  const [label, setLabel] = useState(`Acampa Kids ${nextYear}`);
  const [year, setYear] = useState(String(nextYear));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLabel(`Acampa Kids ${nextYear}`);
    setYear(String(nextYear));
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const yearNumber = Number(year);
  const ready = !!label.trim() && Number.isInteger(yearNumber) && yearNumber > 2000 && yearNumber < 3000;

  async function submit() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const camp = await createCamp(token, { label: label.trim(), year: yearNumber });
      setWizardDismissed(false);
      await onSwitchCamp(camp.id);
    } catch (e) {
      setError(te(e, "Algo deu errado."));
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} title={tx("Novo acampamento")} width={480} dismissible={!busy} className="sheet-dialog" autofocus>
      <form
        className="cat-form cat-form--plain"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <span className="sheet__handle" aria-hidden="true" />
        <h2 className="cat-form__title">
          <img className="admin-title__icon" src={ICONS.createNew} alt="" aria-hidden="true" /> {tx("Novo acampamento")}
        </h2>
        <p className="cat-hint">{tx("Guarda {year} como está e começa {nextYear} do zero.", { year: currentYear, nextYear })}</p>
        <label className="cat-field">
          <span className="cat-field__label">{tx("Nome")}</span>
          <input className="cat-input" value={label} maxLength={80} disabled={busy} onChange={(e) => setLabel(e.target.value)} />
        </label>
        <label className="cat-field">
          <span className="cat-field__label">{tx("Ano")}</span>
          <input className="cat-input" type="number" inputMode="numeric" value={year} disabled={busy} onChange={(e) => setYear(e.target.value)} />
        </label>
        {error && <p className="message message--error">{error}</p>}
        <div className="cat-form__actions">
          <button type="button" className="button button--secondary" disabled={busy} onClick={onClose}>
            {tx("Cancelar")}
          </button>
          <button type="submit" className="button button--primary" disabled={busy || !ready}>
            {busy ? tx("Criando…") : tx("Criar e entrar")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
