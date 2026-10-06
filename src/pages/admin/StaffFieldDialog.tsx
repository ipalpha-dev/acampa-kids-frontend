import { useEffect, useState } from "react";
import { updateStaff, type Staff } from "../../api/staff";
import { TeamSelect, TransportSelect } from "../../components/CategoryFields";
import Dialog from "../../components/Dialog";
import { ICONS } from "../../icons";
import { useI18n } from "../../i18n";

export type StaffQuickField = "team" | "transportation";

const META: Record<StaffQuickField, { title: string }> = {
  team: { title: "Trocar de time" },
  transportation: { title: "Trocar o transporte" },
};

interface StaffFieldDialogProps {
  token: string;
  open: boolean;
  member: Staff;
  field: StaffQuickField;
  onClose: () => void;
}

/** Admin: change ONE quick field of a team member (team or transportation) from the detail page. */
export default function StaffFieldDialog({ token, open, member: s, field, onClose }: StaffFieldDialogProps) {
  const { tx, te } = useI18n();
  const [value, setValue] = useState<string | null>(s[field]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValue(s[field]);
      setError(null);
    }
  }, [open, s, field]);

  const changed = value !== s[field];

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await updateStaff(token, s.id, { [field]: value });
      onClose();
    } catch (e) {
      setError(te(e, "Algo deu errado."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={tx(META[field].title)} width={480} dismissible={!busy} className="sheet-dialog">
      <div className="cat-form cat-form--plain">
        {/* phones: this card is a bottom sheet (see .sheet-dialog) */}
        <span className="sheet__handle" aria-hidden="true" />
        {field === "team" ? (
          <>
            <h2 className="cat-form__title change-room__title">
              <img className="pencil-icon" src={ICONS.pencil} alt="" aria-hidden="true" /> {tx(META.team.title)}
            </h2>
            <TeamSelect value={value} onChange={setValue} disabled={busy} hideLabel />
          </>
        ) : (
          <TransportSelect
            value={value}
            onChange={setValue}
            disabled={busy}
            audience="staff"
            title={
              <>
                <img className="pencil-icon" src={ICONS.transport} alt="" aria-hidden="true" /> {tx(META.transportation.title)}
              </>
            }
          />
        )}

        {error && <p className="message message--error">{error}</p>}

        <div className="cat-form__actions">
          <button type="button" className="button button--secondary" onClick={onClose} disabled={busy}>
            {tx("Cancelar")}
          </button>
          <button type="button" className="button button--primary" disabled={busy || !changed} onClick={submit}>
            {busy ? tx("Salvando…") : tx("Confirmar")}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
