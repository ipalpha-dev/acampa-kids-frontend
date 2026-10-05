import { useEffect, useMemo, useState } from "react";
import { assignStaff, isForWholeTeam, type CampEvent, type ScheduleRole } from "../../api/schedule";
import { speakDay } from "../../dates";
import type { Staff } from "../../api/staff";
import Dialog from "../../components/Dialog";
import { ICONS } from "../../icons";
import { useCollection, useCollectionOrEmpty } from "../../store";
import StaffPicker, { type Occupation } from "./StaffPicker";
import { useI18n } from "../../i18n";
import { firstNameOf, shownName } from "./staffNames";

type Entry = { staff: Pick<Staff, "id" | "name"> } | { eventId: string; roleId: string };

interface AssignRoleDialogProps {
  token: string;
  open: boolean;
  entry: Entry;
  onClose: () => void;
  onAssigned: () => void;
}

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
export function eventsOverlap(a: CampEvent, b: CampEvent): boolean {
  if (a.date !== b.date) return false;
  const aS = toMin(a.startTime), aE = a.endTime ? toMin(a.endTime) : aS + 60;
  const bS = toMin(b.startTime), bE = b.endTime ? toMin(b.endTime) : bS + 60;
  return aS < bE && bS < aE;
}

export function occupationsFor(event: CampEvent, events: CampEvent[], roleById: Map<string, ScheduleRole>, ignoreRoleId?: string, labels?: { otherRole: string; inThisEvent: string }): Map<string, Occupation> {
  const otherRole = labels?.otherRole ?? "outra função";
  const inThisEvent = labels?.inThisEvent ?? "neste evento";
  const m = new Map<string, Occupation>();
  for (const other of events) {
    const here = other.id === event.id;
    if (!here && !eventsOverlap(event, other)) continue;
    for (const a of other.assignments) {
      if (here && a.roleId === ignoreRoleId) continue;
      const r = roleById.get(a.roleId);
      if (!m.has(a.staffId)) m.set(a.staffId, { role: r ? `${r.emoji} ${r.name}` : otherRole, where: here ? inThisEvent : `${other.emoji} ${other.title} ${other.startTime}` });
    }
  }
  return m;
}

export default function AssignRoleDialog({ token, open, entry, onClose, onAssigned }: AssignRoleDialogProps) {
  const { tx } = useI18n();
  const events = useCollection("events");
  const roles = useCollectionOrEmpty("roles");
  const staffList = useCollectionOrEmpty("staff");
  const [eventId, setEventId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [detail, setDetail] = useState("");
  const [step, setStep] = useState<"choose" | "confirm">("choose");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fromPerson = "staff" in entry;

  useEffect(() => {
    if (!open) return;
    setEventId(fromPerson ? "" : entry.eventId);
    setRoleId(fromPerson ? "" : entry.roleId);
    setStaffId(fromPerson ? entry.staff.id : "");
    setDetail("");
    setStep("choose");
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when (re)opened
  }, [open]);

  const roleById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);
  const event = events?.find((e) => e.id === eventId) ?? null;
  const role = roleById.get(roleId) ?? null;
  const person: Pick<Staff, "id" | "name"> | null = fromPerson ? entry.staff : (staffList.find((s) => s.id === staffId) ?? null);

  const occupied = useMemo(
    () => (event && events ? occupationsFor(event, events, roleById, roleId || undefined, { otherRole: tx("outra função"), inThisEvent: tx("neste evento") }) : new Map<string, Occupation>()),
    [event, events, roleById, roleId, tx],
  );
  const occupation = staffId ? occupied.get(staffId) : undefined;

  const pickableRoles = (event?.roles ?? []).map((id) => roleById.get(id)).filter((r): r is ScheduleRole => !!r && !isForWholeTeam(r));
  const alreadyInRole = useMemo(() => new Set((event?.assignments ?? []).filter((a) => a.roleId === roleId).map((a) => a.staffId)), [event, roleId]);
  const pickableStaff = useMemo(
    () => staffList.filter((s) => !alreadyInRole.has(s.id) && (!role?.detailFromTeam || !!s.team)),
    [staffList, alreadyInRole, role],
  );
  const days = [...new Set((events ?? []).map((e) => e.date))].sort();

  const ready = !!eventId && !!roleId && !!staffId;

  async function save() {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await assignStaff(token, eventId, staffId, roleId, detail.trim());
      onAssigned();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : tx("Algo deu errado."));
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    if (occupation && step === "choose") setStep("confirm");
    else save();
  }

  if (!fromPerson && !staffId) {
    return (
      <StaffPicker
        open={open}
        title={role && event ? `${role.emoji} ${role.name} — ${event.emoji} ${event.title} ${event.startTime}` : tx("Quem?")}
        staff={pickableStaff}
        occupied={occupied}
        onPick={(id) => {
          setStaffId(id);
          const occ = occupied.get(id);
          if (!occ && (!role?.hasDetail || role.detailFromTeam)) {
            setBusy(true);
            assignStaff(token, eventId, id, roleId, "")
              .then(() => {
                onAssigned();
                onClose();
              })
              .catch((err) => setError(err instanceof Error ? err.message : tx("Algo deu errado.")))
              .finally(() => setBusy(false));
          } else if (occ) setStep("confirm");
        }}
        onClose={() => !busy && onClose()}
      />
    );
  }

  const first = person ? firstNameOf(person.name) : "";
  const swapping = step === "confirm" && !!occupation;
  const inThisEvent = tx("neste evento");

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} title={swapping ? tx("Trocar função") : tx("Vincular função")} width={560} className="sheet-dialog">
      <form className="cat-form cat-form--embedded" onSubmit={handleSubmit}>
        <span className="sheet__handle" aria-hidden="true" />
        <h2 className="cat-form__title">
          {swapping ? (
            <>
              <img className="admin-title__icon" src={ICONS.swap} alt="" aria-hidden="true" /> {tx("Trocar função?")}
            </>
          ) : (
            tx("🎯 Vincular função — {name}", { name: first })
          )}
        </h2>

        {fromPerson && !swapping && (
          <label className="cat-field">
            <span className="cat-field__label">{tx("Evento")}</span>
            <select
              className="cat-input"
              value={eventId}
              disabled={busy || !events}
              onChange={(e) => {
                setEventId(e.target.value);
                setRoleId("");
              }}
            >
              <option value="">{events ? tx("Escolha o evento") : tx("Carregando…")}</option>
              {days.map((d) => (
                <optgroup key={d} label={speakDay(d)}>
                  {events!
                    .filter((e) => e.date === d && e.roles.length > 0)
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.startTime} · {e.emoji} {e.title}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
        )}
        {fromPerson && !swapping && event && (
          <>
            {pickableRoles.length === 0 ? (
              <p className="cat-hint cat-hint--error">{tx("Este evento só tem funções que já valem para toda a equipe. Nada a escalar aqui.")}</p>
            ) : (
              <fieldset className="cat-fieldset">
                <legend className="cat-field__label">{tx("Função")}</legend>
                <div className="chip-group">
                  {pickableRoles.map((r) => {
                    const on = roleId === r.id;
                    return (
                      <button key={r.id} type="button" className={`chip-toggle chip-toggle--small ${on ? "chip-toggle--on" : ""}`} aria-pressed={on} disabled={busy} onClick={() => setRoleId(r.id)}>
                        {r.emoji} {r.name}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            )}
            {occupation && roleId && (
              <p className="cat-hint">
                {occupation.where === inThisEvent
                  ? tx("{name} já está como {role} neste evento — vamos confirmar a troca.", { name: first, role: occupation.role })
                  : tx("{name} já está como {role} em {where} — vamos confirmar a troca.", { name: first, role: occupation.role, where: occupation.where })}
              </p>
            )}
          </>
        )}

        {swapping && person && event && role && (
          <div className="swap">
            <p className="confirm__message">
              {occupation!.where === inThisEvent
                ? tx("{name} já tem função neste evento:", { name: shownName(person.name) })
                : tx("{name} já tem função no mesmo horário:", { name: shownName(person.name) })}
            </p>
            <div className="swap__flow" aria-label={tx("Troca de função")}>
              <div className="swap__card swap__card--from">
                <span className="swap__label">{tx("Hoje")}</span>
                <strong className="swap__role">{occupation!.role}</strong>
                <span className="swap__where">{occupation!.where === inThisEvent ? `${event.emoji} ${event.title}` : occupation!.where}</span>
              </div>
              <span className="swap__arrow" aria-hidden="true">➜</span>
              <div className="swap__card swap__card--to">
                <span className="swap__label">{tx("Passa a")}</span>
                <strong className="swap__role">
                  {role.emoji} {role.name}
                </strong>
                <span className="swap__where">
                  {event.emoji} {event.title}
                </span>
              </div>
            </div>
            {occupation!.where !== inThisEvent && <p className="cat-hint">{tx("A função no outro evento continua — confira a escala depois.")}</p>}
          </div>
        )}

        {!fromPerson && !swapping && person && event && role && (
          <p className="confirm__message">
            {tx("{person} como {role} em {event}", { person: shownName(person.name), role: `${role.emoji} ${role.name}`, event: `${event.emoji} ${event.title}` })}
          </p>
        )}

        {role?.detailFromTeam && roleId && (
          <p className="cat-hint">{tx("🚩 O detalhe desta função é o time da pessoa — nada a preencher. Só quem tem time aparece na lista.")}</p>
        )}

        {role?.hasDetail && !role.detailFromTeam && roleId && (
          <label className="cat-field">
            <span className="cat-field__label">{tx("Detalhe")}</span>
            <input className="cat-input" placeholder={role.detailPlaceholder || tx("detalhe")} value={detail} maxLength={60} disabled={busy} autoFocus={!fromPerson} onChange={(e) => setDetail(e.target.value)} />
          </label>
        )}

        {error && <p className="message message--error">{error}</p>}

        <div className="cat-form__actions">
          <button type="button" className="button button--secondary" onClick={() => (swapping && fromPerson ? setStep("choose") : onClose())} disabled={busy}>
            {swapping && fromPerson ? tx("Voltar") : tx("Cancelar")}
          </button>
          <button type="submit" className="button button--primary" disabled={busy || !ready}>
            {busy ? tx("Salvando…") : swapping ? tx("Trocar") : occupation ? tx("Continuar") : tx("Vincular")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
