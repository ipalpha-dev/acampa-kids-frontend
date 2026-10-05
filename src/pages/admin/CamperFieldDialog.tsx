import { useEffect, useState } from "react";
import { updateCamper, type Camper } from "../../api/campers";
import { TeamSelect, TransportSelect } from "../../components/CategoryFields";
import Dialog from "../../components/Dialog";
import { ICONS } from "../../icons";
import { useI18n } from "../../i18n";

export type CamperQuickField = "team" | "transportation";

interface CamperFieldDialogProps {
  token: string;
  open: boolean;
  camper: Camper;
  field: CamperQuickField;
  onClose: () => void;
}

/** Admin: change ONE quick field of a kid (team or transportation) from the detail page. */
export default function CamperFieldDialog({ token, open, camper: k, field, onClose }: CamperFieldDialogProps) {
  const { tx, te } = useI18n();
  const META: Record<CamperQuickField, { title: string }> = {
    team: { title: tx("Trocar de time") },
    transportation: { title: tx("Trocar o transporte") },
  };
  const [value, setValue] = useState<string | null>(k[field]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValue(k[field]);
      setError(null);
    }
  }, [open, k, field]);

  const changed = value !== k[field];

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await updateCamper(token, k.id, { [field]: value });
      onClose();
    } catch (e) {
      setError(te(e, "Algo deu errado."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={META[field].title} width={480} dismissible={!busy} className="sheet-dialog">
      <div className="cat-form cat-form--plain">
        {/* phones: this card is a bottom sheet (see .sheet-dialog) */}
        <span className="sheet__handle" aria-hidden="true" />
        {field === "team" ? (
          <>
            <h2 className="cat-form__title change-room__title">
              <img className="pencil-icon" src={ICONS.pencil} alt="" aria-hidden="true" /> {META.team.title}
            </h2>
            <TeamSelect value={value} onChange={setValue} disabled={busy} hideLabel />
          </>
        ) : (
          <TransportSelect
            value={value}
            onChange={setValue}
            disabled={busy}
            title={
              <>
                <img className="pencil-icon" src={ICONS.transport} alt="" aria-hidden="true" /> {META.transportation.title}
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
