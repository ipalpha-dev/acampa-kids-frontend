import { useMemo, useState } from "react";
import { createOccurrence, type Occurrence } from "../api/occurrences";
import type { Camper } from "../api/campers";
import type { Bedroom } from "../api/bedrooms";
import { staffSex, type Staff } from "../api/staff";
import Dialog from "../components/Dialog";
import SearchField from "../components/SearchField";
import RichHtml from "../components/RichHtml";
import RichTextEditor from "../components/RichTextEditor";
import { useCollection } from "../store";
import { useNames } from "../store/people";
import { speakDateTime } from "../dates";
import PageFooter from "../components/PageFooter";
import { ICONS, kidFaceSrc } from "../icons";
import { useHideScanFab } from "../scanFab";
import { collatorLocale, useI18n } from "../i18n";

type OccurrenceAudience = "admin" | "organizer" | "medical";

interface OccurrencesPageProps {
  token: string;
  audience: OccurrenceAudience;
}

type PersonKind = "camper" | "staff";

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();


export default function OccurrencesPage({ token, audience }: OccurrencesPageProps) {
  const { tx, te } = useI18n();
  const occurrences = useCollection("occurrences");
  const campers = useCollection("campers");
  const staff = useCollection("staff");
  const bedrooms = useCollection("bedrooms");
  const [creating, setCreating] = useState(false);
  const [camperIds, setCamperIds] = useState<string[]>([]);
  const [staffIds, setStaffIds] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [picker, setPicker] = useState<PersonKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // while the form is open the "Ler crachá" FAB would sit on top of Registrar / Cancelar
  useHideScanFab(creating);

  const camperById = useMemo(() => new Map((campers ?? []).map((person) => [person.id, person])), [campers]);
  const staffById = useMemo(() => new Map((staff ?? []).map((person) => [person.id, person])), [staff]);
  const selectedCampers = camperIds.map((id) => camperById.get(id)).filter((person): person is Camper => !!person);
  const selectedStaff = staffIds.map((id) => staffById.get(id)).filter((person): person is Staff => !!person);
  const valid = description.trim().length > 0;

  function resetForm() {
    setCamperIds([]);
    setStaffIds([]);
    setDescription("");
    setError(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await createOccurrence(token, { camperIds, staffIds, description });
      resetForm();
      setCreating(false);
      setSaved(true);
    } catch (err) {
      setError(te(err, "Não foi possível registrar a ocorrência."));
    } finally {
      setBusy(false);
    }
  }

  if (!occurrences || !campers || !staff) {
    return (
      <div className="admin-page">
        <p className="opt-empty">{tx("Sincronizando ocorrências… 🏕️")}</p>
      </div>
    );
  }

  return (
    <div className="admin-page admin-page--wide">
      <header className="admin-head">
        <h1 className="admin-title">📋 {tx("Ocorrências")}</h1>
        {!creating && (
          <button type="button" className="button button--primary admin-head__new" onClick={() => { resetForm(); setSaved(false); setCreating(true); }}>
            {tx("+ Registrar")}
          </button>
        )}
      </header>
      <p className="admin-intro">
        {tx("Registre com clareza o que aconteceu e quem estava envolvido.")}
      </p>
      {saved && <p className="message message--ok">{tx("✅ Ocorrência registrada.")}</p>}
      {error && <p className="message message--error">{error}</p>}

      {creating && (
        <form className="cat-form occurrence-form" onSubmit={submit}>
          <h2 className="cat-form__title">{tx("Nova ocorrência")}</h2>
          <div className="occurrence-people-grid">
            <PeopleField
              title={tx("Acampantes relacionados")}
              hint={tx("Opcional. Selecione todas as crianças envolvidas.")}
              people={selectedCampers}
              onAdd={() => setPicker("camper")}
              onRemove={(id) => setCamperIds((current) => current.filter((item) => item !== id))}
              disabled={busy}
            />
            <PeopleField
              title={tx("Equipe relacionada")}
              hint={tx("Opcional. Selecione todas as pessoas da equipe envolvidas.")}
              people={selectedStaff}
              onAdd={() => setPicker("staff")}
              onRemove={(id) => setStaffIds((current) => current.filter((item) => item !== id))}
              disabled={busy}
            />
          </div>
          <div className="cat-field">
            <span className="cat-field__label">{tx("Descrição do que aconteceu")}</span>
            <p className="cat-hint">{tx("Inclua fatos, horário e providências tomadas. Fotos: 🖼️ ou cole / arraste.")}</p>
            <RichTextEditor token={token} value={description} onChange={setDescription} disabled={busy} placeholder={tx("Descreva a ocorrência…")} tall aiContext="occurrence" />
          </div>
          <div className="cat-form__actions">
            <button type="button" className="button button--secondary" disabled={busy} onClick={() => { resetForm(); setCreating(false); }}>
              {tx("Cancelar")}
            </button>
            <button type="submit" className="button button--primary" disabled={!valid || busy}>
              {busy ? tx("Registrando…") : tx("Registrar ocorrência")}
            </button>
          </div>
        </form>
      )}

      <PersonPicker
        open={picker !== null}
        kind={picker ?? "camper"}
        campers={campers}
        staff={staff}
        selectedIds={picker === "staff" ? staffIds : camperIds}
        onPick={(id) => {
          if (picker === "staff") setStaffIds((current) => current.includes(id) ? current : [...current, id]);
          else setCamperIds((current) => current.includes(id) ? current : [...current, id]);
        }}
        onClose={() => setPicker(null)}
      />

      {occurrences.length === 0 ? (
        !creating && (
          <div className="admin-empty">
            <span className="admin-empty__emoji">📋</span>
            <p>{tx("Nenhuma ocorrência registrada.")}</p>
            <button type="button" className="button button--primary" onClick={() => setCreating(true)}>{tx("+ Registrar ocorrência")}</button>
          </div>
        )
      ) : (
        <section className="occurrence-list" aria-label={tx("Ocorrências registradas")}>
          {occurrences.map((occurrence) => <OccurrenceCard key={occurrence.id} occurrence={occurrence} campers={camperById} staff={staffById} bedrooms={bedrooms ?? []} />)}
        </section>
      )}
      <PageFooter>
        {audience === "admin" ? tx("🔒 Você vê as ocorrências de todos.") : audience === "organizer" ? tx("🔒 Só os organizadores vêem estas ocorrências.") : tx("🔒 Só a equipe médica vê estas ocorrências.")}
      </PageFooter>
    </div>
  );
}

function PeopleField({ title, hint, people, onAdd, onRemove, disabled }: {
  title: string;
  hint: string;
  people: Array<{ id: string; name: string }>;
  onAdd: () => void;
  onRemove: (id: string) => void;
  disabled: boolean;
}) {
  const { tx } = useI18n();
  return (
    <section className="occurrence-people">
      <div className="list-head">
        <h3 className="occurrence-people__title">{title} <span className="cat-tab__count">{people.length}</span></h3>
        <button type="button" className="button button--secondary occurrence-people__add" disabled={disabled} onClick={onAdd}>+ {tx("Adicionar")}</button>
      </div>
      <p className="cat-hint">{hint}</p>
      {people.length === 0 ? <p className="occurrence-people__empty">{tx("Ninguém selecionado.")}</p> : (
        <ul className="occurrence-chips">
          {people.map((person) => (
            <li key={person.id} className="staff-tag helpers-tag">
              <span>{person.name || "…"}</span>
              <button type="button" className="helpers-tag__x" disabled={disabled} aria-label={tx("Remover {name}", { name: person.name || "…" })} onClick={() => onRemove(person.id)}>✕</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PersonPicker({ open, kind, campers, staff, selectedIds, onPick, onClose }: {
  open: boolean;
  kind: PersonKind;
  campers: Camper[];
  staff: Staff[];
  selectedIds: string[];
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const { tx } = useI18n();
  const [query, setQuery] = useState("");
  const people = (kind === "camper" ? campers : staff.filter((person) => person.active)).filter((person) => !selectedIds.includes(person.id));
  const filtered = people.filter((person) => normalize(person.name).includes(normalize(query.trim()))).sort((a, b) => a.name.localeCompare(b.name, collatorLocale()));
  const pickerTitle = kind === "camper" ? tx("Adicionar acampante") : tx("Adicionar pessoa da equipe");
  return (
    <Dialog open={open} onClose={() => { setQuery(""); onClose(); }} title={pickerTitle} width={520} autofocus>
      <div className="picker">
        <h2 className="cat-form__title">{pickerTitle}</h2>
        <SearchField value={query} onChange={setQuery} autoFocus placeholder={tx("Digite o nome…")} aria-label={tx("Buscar pessoa")} />
        {filtered.length === 0 ? <p className="opt-empty">{tx("Ninguém encontrado.")}</p> : (
          <ul className="picker__list">
            {filtered.map((person) => (
              <li key={person.id}>
                <button type="button" className="picker__item" onClick={() => { onPick(person.id); setQuery(""); onClose(); }}>
                  <span className="picker__name">{person.name || "…"}</span><span aria-hidden="true">+</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}

function OccurrenceCard({ occurrence, campers, staff, bedrooms }: { occurrence: Occurrence; campers: Map<string, Camper>; staff: Map<string, Staff>; bedrooms: Bedroom[] }) {
  const { tx } = useI18n();
  const [open, setOpen] = useState(false);
  /** the occurrence holds person ids only: names are read live from IPAlpha */
  const nameOf = useNames([...occurrence.campers, ...occurrence.staff, occurrence.createdBy.personId]);
  const shown = (id: string) => nameOf(id) || "…";
  const names = occurrence.campers.map(shown);
  return (
    <article className="detail-card occurrence-card">
      <button type="button" className="occurrence-card__head" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span className="occurrence-card__date">{speakDateTime(occurrence.createdAt)}</span>
        <span className="occurrence-card__summary">
          <strong>{names.length > 0 ? names.join(", ") : tx("Sem acampante relacionado")}</strong>
          <small>{tx("Registrado por {name}", { name: shown(occurrence.createdBy.personId) })}</small>
        </span>
        <span className="occurrence-card__chevron" aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      <div className="occurrence-card__people">
        {occurrence.campers.map((id) => {
          const kid = campers.get(id);
          return (
            <span key={`c-${id}`} className="occurrence-badge occurrence-badge--camper">
              <img className="occurrence-badge__face" src={kidFaceSrc(kid?.sex, id)} alt="" aria-hidden="true" /> {shown(id)}
            </span>
          );
        })}
        {occurrence.staff.map((id) => {
          const member = staff.get(id);
          const sex = member ? staffSex(member, bedrooms) : null;
          const face = sex === "M" ? ICONS.leaderFace : ICONS.leaderFaceWoman;
          return (
            <span key={`s-${id}`} className="occurrence-badge">
              <img className="occurrence-badge__face" src={face} alt="" aria-hidden="true" /> {shown(id)}
            </span>
          );
        })}
        {occurrence.campers.length === 0 && occurrence.staff.length === 0 && <span className="occurrence-badge occurrence-badge--private">{tx("Sem pessoas relacionadas")}</span>}
      </div>
      {open && <RichHtml html={occurrence.description} className="instructions occurrence-card__description" />}
    </article>
  );
}
