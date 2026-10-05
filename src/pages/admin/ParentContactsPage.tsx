import { useEffect, useMemo, useState } from "react";
import { updateSettings, type ParentContact } from "../../api/settings";
import { useCollection, useCollectionOrEmpty } from "../../store";
import { useNames } from "../../store/people";
import { shownName } from "./staffNames";
import StaffPicker from "./StaffPicker";
import { speakWhen } from "../../dates";
import PageFooter from "../../components/PageFooter";
import { useI18n } from "../../i18n";

interface ParentContactsPageProps {
  token: string;
}

interface ContactDraft {
  id: string | null;
  title: string;
  personId: string;
}

const EMPTY_DRAFT: ContactDraft = { id: null, title: "", personId: "" };
function contactId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `contact-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}


/** These contacts are visible for as long as the parents may use the app (Geral → janela de acesso dos pais). */
function ParentWindowNote({ window: w }: { window: { from: string | null; until: string | null; open: boolean } }) {
  const { tx } = useI18n();
  const range = w.from && w.until ? tx("de {from} até {until}", { from: speakWhen(w.from), until: speakWhen(w.until) }) : null;
  return (
    <p className={`message ${w.open ? "message--ok" : "message--warn"}`}>
      {w.open ? "🟢" : "🕒"} {tx("Os pais veem estes contatos")} <strong>{tx("o tempo todo em que têm acesso ao app")}</strong> {tx("(janela de acesso dos pais, em Geral).")}{" "}
      {tx("Já a")} <strong>{tx("equipe do quarto")}</strong> {tx("da criança só aparece durante o acampamento")}
      {range ? <>: <strong>{range}</strong></> : ` ${tx("(defina a janela de check-in e a programação)")}`}.
    </p>
  );
}

/** Admin-only list of the staff contacts shown to parents. */
export default function ParentContactsPage({ token }: ParentContactsPageProps) {
  const { tx } = useI18n();
  const staff = useCollectionOrEmpty("staff");
  const settings = useCollection("settings");
  const [contacts, setContacts] = useState<ParentContact[]>([]);
  const [draft, setDraft] = useState<ContactDraft>(EMPTY_DRAFT);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const staffById = useMemo(() => new Map(staff.map((person) => [person.id, person])), [staff]);
  // a contact may point at someone who left the team: their name is still read live by person id
  const nameOf = useNames([...contacts.map((c) => c.personId), draft.personId]);
  const contactName = (personId: string) => staffById.get(personId)?.name || nameOf(personId);
  const selectedStaff = draft.personId ? staffById.get(draft.personId) ?? null : null;
  const editing = draft.id !== null;
  const validDraft = draft.title.trim().length > 0 && !!selectedStaff?.active;

  useEffect(() => {
    if (settings) setContacts(settings.parentContacts);
  }, [settings]);

  function resetDraft() {
    setDraft(EMPTY_DRAFT);
    setPickerOpen(false);
  }

  async function persist(nextContacts: ParentContact[]): Promise<boolean> {
    if (busy) return false;
    const previous = contacts;
    setBusy(true);
    setError(null);
    setContacts(nextContacts);
    try {
      await updateSettings(token, { parentContacts: nextContacts });
      return true;
    } catch (cause) {
      setContacts(previous);
      setError(cause instanceof Error ? cause.message : tx("Algo deu errado."));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submitDraft(e: React.FormEvent) {
    e.preventDefault();
    if (!validDraft || busy) return;
    const nextContact: ParentContact = {
      id: draft.id ?? contactId(),
      title: draft.title.trim(),
      personId: draft.personId,
    };
    const nextContacts = draft.id
      ? contacts.map((contact) => (contact.id === draft.id ? nextContact : contact))
      : [...contacts, nextContact];
    if (await persist(nextContacts)) resetDraft();
  }

  function edit(contact: ParentContact) {
    setDraft({ ...contact });
  }

  async function remove(id: string) {
    if (await persist(contacts.filter((contact) => contact.id !== id)) && draft.id === id) resetDraft();
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= contacts.length) return;
    const next = [...contacts];
    [next[index], next[target]] = [next[target], next[index]];
    await persist(next);
  }

  if (!settings && !error) {
    return (
      <div className="admin-page">
        <p className="opt-empty">{tx("Carregando configurações… 📞")}</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <header className="admin-head">
        <h1 className="admin-title">📞 {tx("Contatos importantes")}</h1>
      </header>
      <p className="admin-intro">
        {tx("Quem os pais podem procurar, com um")} <strong>{tx("título claro")}</strong> {tx("para o assunto. Os pais veem o nome e podem pedir o celular de cada pessoa.")}
      </p>
      {settings && <ParentWindowNote window={settings.parentWindow} />}

      {error && <p className="message message--error">{error}</p>}

      <form className="cat-form contact-form" onSubmit={submitDraft}>
        <h2 className="cat-form__title">{editing ? tx("✏️ Editar contato") : tx("➕ Novo contato")}</h2>
        <label className="cat-field">
          <span className="cat-field__label">{tx("Título")}</span>
          <input
            className="cat-input"
            placeholder={tx("ex.: Coordenação do acampamento")}
            value={draft.title}
            maxLength={80}
            disabled={busy}
            autoFocus
            onChange={(e) => setDraft((current) => ({ ...current, title: e.target.value }))}
          />
        </label>
        <div className="cat-field">
          <span className="cat-field__label">{tx("Pessoa da equipe")}</span>
          <button type="button" className="contact-person" disabled={busy} onClick={() => setPickerOpen(true)}>
            <span className="contact-person__icon" aria-hidden="true">👤</span>
            <span className="contact-person__body">
              <strong>{selectedStaff ? shownName(contactName(selectedStaff.id)) : tx("Escolher pessoa")}</strong>
              <span>{selectedStaff ? tx("Toque para trocar") : tx("Busque na equipe ativa")}</span>
            </span>
            <span className="contact-person__action">{selectedStaff ? tx("Trocar") : tx("Escolher")}</span>
          </button>
        </div>
        <div className="cat-form__actions">
          {editing && (
            <button type="button" className="button button--secondary" disabled={busy} onClick={resetDraft}>
              {tx("Cancelar")}
            </button>
          )}
          <button type="submit" className="button button--primary" disabled={busy || !validDraft}>
            {busy ? tx("Salvando…") : editing ? tx("Atualizar contato") : tx("Adicionar contato")}
          </button>
        </div>
      </form>

      <section className="contacts-section" aria-labelledby="contacts-list-title">
        <div className="list-head">
          <h2 id="contacts-list-title" className="cat-form__title">
            {tx("Contatos cadastrados")} <span className="cat-tab__count">{contacts.length}</span>
          </h2>
        </div>
        {contacts.length === 0 ? (
          <p className="opt-empty">{tx("Nenhum contato cadastrado ainda.")}</p>
        ) : (
          <ol className="contact-list">
            {contacts.map((contact, index) => {
              const person = staffById.get(contact.personId);
              const name = contactName(contact.personId);
              return (
                <li key={contact.id} className="contact-item">
                  <div className="contact-item__main">
                    <span className="contact-item__icon" aria-hidden="true">👤</span>
                    <div className="contact-item__body">
                      <h3>{contact.title}</h3>
                      <p>{person || name ? shownName(name) : tx("Não está mais na equipe")}</p>
                    </div>
                  </div>
                  <div className="contact-item__actions" aria-label={tx("Ações de {title}", { title: contact.title })}>
                    <button type="button" className="icon-btn" title={tx("Mover para cima")} disabled={busy || index === 0} onClick={() => void move(index, -1)}>▲</button>
                    <button type="button" className="icon-btn" title={tx("Mover para baixo")} disabled={busy || index === contacts.length - 1} onClick={() => void move(index, 1)}>▼</button>
                    <button type="button" className="icon-btn" title={tx("Editar")} disabled={busy} onClick={() => edit(contact)}><span className="pencil" aria-hidden="true">✏️</span></button>
                    <button type="button" className="icon-btn icon-btn--danger" title={tx("Remover")} disabled={busy} onClick={() => void remove(contact.id)}>🗑️</button>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <PageFooter>{tx("O celular vem do cadastro da pessoa no IPAlpha. Quem entra nesta lista passa a ter acesso ao app fora da janela da equipe (como a organização).")}</PageFooter>

      <StaffPicker
        open={pickerOpen}
        title={tx("Escolher pessoa da equipe")}
        staff={staff}
        occupied={new Map()}
        onPick={(personId) => {
          setDraft((current) => ({ ...current, personId }));
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </div>
  );
}
