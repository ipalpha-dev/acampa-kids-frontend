import RoomRoleIcon from "../../components/RoomRoleIcon";
import { useEffect, useMemo, useState } from "react";
import { moveCamper, type Camper } from "../../api/campers";
import { staffSex } from "../../api/staff";
import { bedroomGroupsForSex } from "../../api/bedrooms";
import { BedroomSelect } from "../../components/CategoryFields";
import Dialog from "../../components/Dialog";
import { ICONS } from "../../icons";
import { useCollectionOrEmpty } from "../../store";
import { useI18n } from "../../i18n";
import { compareByName, firstNameOf, shownName } from "./staffNames";

interface ChangeRoomDialogProps {
  token: string;
  open: boolean;
  camper: Camper;
  onClose: () => void;
}

/**
 * Admin: move a kid to another room and pick WHO looks after them there.
 * Only the CARETAKERS of the chosen room are offered, as big tap targets
 * (most rooms have one or two). With exactly one caretaker nothing is asked —
 * it is picked for you. With none the kid becomes an orphan (warned).
 * Works on the current room too: to hand the kid to another caretaker.
 */
export default function ChangeRoomDialog({ token, open, camper: k, onClose }: ChangeRoomDialogProps) {
  const { tx } = useI18n();
  const bedrooms = useCollectionOrEmpty("bedrooms");
  const staff = useCollectionOrEmpty("staff");
  const [bedroom, setBedroom] = useState<string | null>(k.bedroom);
  const [caretakerId, setCaretakerId] = useState<string | null>(k.caretakerId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setBedroom(k.bedroom);
      setCaretakerId(k.caretakerId);
      setError(null);
    }
  }, [open, k.bedroom, k.caretakerId]);

  const room = bedroom ? bedrooms.find((b) => b.id === bedroom) : null;
  const caretakers = useMemo(
    // an admin sleeping in the room is not a líder: their roster record is only for the room / transport / vest
    () => (bedroom ? staff.filter((s) => s.bedroom === bedroom && s.roomRole === "caretaker").sort(compareByName) : []),
    [staff, bedroom],
  );
  const helpers = useMemo(() => (bedroom ? staff.filter((s) => s.bedroom === bedroom && s.roomRole === "helper") : []), [staff, bedroom]);

  // one caretaker → no question asked; none → orphan; the current one stays selected when still valid
  useEffect(() => {
    if (caretakers.length === 1) setCaretakerId(caretakers[0].id);
    else if (!caretakers.some((s) => s.id === caretakerId)) setCaretakerId(null);
  }, [caretakers, caretakerId]);

  const changed = bedroom !== k.bedroom || caretakerId !== k.caretakerId;
  const sex = (room?.group === "girls" ? "F" : room?.group === "boys" ? "M" : null) ?? k.sex;
  const needsPick = caretakers.length > 1 && !caretakerId;
  const first = firstNameOf(k.name);
  const whoCares =
    sex === "F"
      ? tx("Quem vai cuidar da {name}?", { name: first })
      : sex === "M"
        ? tx("Quem vai cuidar do {name}?", { name: first })
        : tx("Quem vai cuidar do(a) {name}?", { name: first });

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await moveCamper(token, k.id, bedroom, caretakerId);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : tx("Algo deu errado."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={tx("Trocar de quarto")} width={560} dismissible={!busy} className="sheet-dialog">
      <div className="cat-form cat-form--plain">
        {/* phones: this card is a bottom sheet (see .sheet-dialog) */}
        <span className="sheet__handle" aria-hidden="true" />
        <h2 className="cat-form__title change-room__title">
          <img className="admin-title__icon" src={ICONS.swap} alt="" aria-hidden="true" /> {tx("Trocar de quarto")}
        </h2>

        <BedroomSelect bedrooms={bedrooms} value={bedroom} onChange={setBedroom} current={k.bedroom} groups={bedroomGroupsForSex(k.sex)} disabled={busy} />

        {bedroom && (
          <fieldset className="cat-fieldset change-room__caretaker">
            {caretakers.length !== 1 && (
              <legend className="cat-field__label">
                <RoomRoleIcon role="caretaker" sex={sex} /> {whoCares}
              </legend>
            )}
            {caretakers.length === 0 && (
              <p className="message message--warn">
                {helpers.length
                  ? <>{tx("⚠️ Nenhum líder neste quarto (só auxiliares: {names}). A criança ficará", { names: helpers.map((h) => firstNameOf(h.name)).join(", ") })} <strong>{tx("sem líder")}</strong>.</>
                  : <>{tx("⚠️ Nenhum líder neste quarto. A criança ficará")} <strong>{tx("sem líder")}</strong>.</>}
              </p>
            )}
            {caretakers.length === 1 && (
              <p className="cat-hint">
                {sex === "F"
                  ? tx("Quem vai cuidar da {name} agora vai ser a", { name: first })
                  : sex === "M"
                    ? tx("Quem vai cuidar do {name} agora vai ser o", { name: first })
                    : tx("Quem vai cuidar do(a) {name} agora vai ser o", { name: first })}{" "}
                <strong>{shownName(caretakers[0].name)}</strong>.
              </p>
            )}
            {caretakers.length > 1 && (
              <div className="big-options">
                {caretakers.map((s) => {
                  const on = caretakerId === s.id;
                  return (
                    <button key={s.id} type="button" className={`big-option ${on ? "big-option--on" : ""}`} aria-pressed={on} disabled={busy} onClick={() => setCaretakerId(s.id)}>
                      <span className="big-option__emoji" aria-hidden="true">
                        <RoomRoleIcon role="caretaker" size={32} sex={staffSex(s, bedrooms)} />
                      </span>
                      <span className="big-option__label">{shownName(s.name)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </fieldset>
        )}
        {!bedroom && <p className="cat-hint">{tx("Sem quarto a criança fica sem líder.")}</p>}

        {error && <p className="message message--error">{error}</p>}

        <div className="cat-form__actions">
          <button type="button" className="button button--secondary" onClick={onClose} disabled={busy}>
            {tx("Cancelar")}
          </button>
          <button type="button" className="button button--primary" disabled={busy || !changed || needsPick} onClick={submit}>
            {busy ? tx("Salvando…") : tx("Confirmar")}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
