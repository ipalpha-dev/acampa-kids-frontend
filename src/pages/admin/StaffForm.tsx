import RoomRoleIcon from "../../components/RoomRoleIcon";
import { useEffect, useMemo, useRef, useState } from "react";
import { useConfirmChoice } from "../../components/ConfirmDialog";
import { bedroomGroupsForSex } from "../../api/bedrooms";
import { BedroomSelect, TeamSelect, TransportSelect } from "../../components/CategoryFields";
import { useCollectionOrEmpty } from "../../store";
import { rememberPeople } from "../../store/people";
import { ROOM_ROLE_META, type RoomRole, type Staff, type StaffInput, type StaffRegistration } from "../../api/staff";
import type { CamperSex } from "../../api/campers";
import { searchPeople } from "../../api/people";
import OptionCards from "../../components/OptionCards";
import PhoneInput from "../../components/PhoneInput";
import SearchField from "../../components/SearchField";
import Toggle from "../../components/Toggle";
import { toE164 } from "../../phone";
import { useHideScanFab } from "../../scanFab";
import { ICONS } from "../../icons";
import { useI18n } from "../../i18n";
import { compareByName, shownName } from "./staffNames";
import css from "./staffGroup.module.scss";

/** how the coordenação brings someone into the team */
type AddMode = "existing" | "new";

interface FoundPerson {
  personId: string;
  name: string;
  nickname: string | null;
  sex: CamperSex | null;
}

interface StaffFormProps {
  /** session token — searches IPAlpha for people already in the project */
  token: string;
  /** when editing, the existing member (camp ops only); when creating, undefined */
  member?: Staff;
  busy?: boolean;
  /** edit: the camp-ops fields (PUT /api/staff/:id) */
  onSubmit?: (input: StaffInput) => Promise<void>;
  /** create, "Já está no IPAlpha": an existing person joins this camp's team */
  onAddExisting?: (personId: string, ops: Partial<StaffInput>) => Promise<void>;
  /** create, "Cadastrar pessoa nova": registered in IPAlpha (+ equipe membership) */
  onRegister?: (input: StaffRegistration) => Promise<void>;
  /** the sex shown in the "Novo membro" title icon (picked person / room wing) */
  onSexChange?: (sex: CamperSex | null) => void;
  /**
   * Set by the form to a guard the parent calls before navigating away (breadcrumbs).
   * Resolves true when navigation may proceed, false to stay on the form.
   */
  leaveGuardRef?: React.MutableRefObject<(() => Promise<boolean>) | null>;
}

/**
 * Add / edit a team member. People live in IPAlpha (CONTRACTS_ACAMPA §15):
 * creating either brings someone who is ALREADY in the project's team into
 * this camp, or registers a new person (name, phone, optional sex, home church
 * and emergency contact travel in core's registration). Editing touches camp
 * operations only — the person's data and health are kept in IPAlpha.
 */
export default function StaffForm({ token, member, busy, onSubmit, onAddExisting, onRegister, onSexChange, leaveGuardRef }: StaffFormProps) {
  const { tx } = useI18n();
  // the "Ler crachá" FAB would sit on top of Salvar / Cancelar
  useHideScanFab();
  const editing = !!member;
  const [mode, setMode] = useState<AddMode | null>(null);

  // ── "Já está no IPAlpha" ──
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<FoundPerson[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [picked, setPicked] = useState<FoundPerson | null>(null);

  // ── "Cadastrar pessoa nova" ──
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [sex, setSex] = useState<CamperSex | null>(null);
  const [homeChurch, setHomeChurch] = useState("");
  const [hasEmergency, setHasEmergency] = useState(false);
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [emergencyRelation, setEmergencyRelation] = useState("");

  // ── camp ops (both) ──
  const [active, setActive] = useState(member?.active ?? true);
  const [roomRole, setRoomRole] = useState<RoomRole>(member?.roomRole ?? "helper");
  const [team, setTeam] = useState<string | null>(member?.team ?? null);
  const [bedroom, setBedroom] = useState<string | null>(member?.bedroom ?? null);
  const [transportation, setTransportation] = useState<string | null>(member?.transportation ?? null);
  const [generalNotes, setGeneralNotes] = useState(member?.generalNotes ?? "");
  const [error, setError] = useState<string | null>(null);

  const bedrooms = useCollectionOrEmpty("bedrooms");
  const roster = useCollectionOrEmpty("staff");
  const onTeam = useMemo(() => new Set(roster.map((s) => s.id)), [roster]);
  const room = bedroom ? bedrooms.find((b) => b.id === bedroom) : undefined;
  const roomSex: CamperSex | null = room?.group === "girls" ? "F" : room?.group === "boys" ? "M" : null;
  /** the person's sex as IPAlpha knows it (picked person / the form) — the room wing wins */
  const personSex: CamperSex | null = editing ? (member?.sex ?? null) : mode === "existing" ? (picked?.sex ?? null) : sex;
  const shownSex = roomSex ?? personSex;
  useEffect(() => {
    onSexChange?.(shownSex);
  }, [shownSex, onSexChange]);

  // search IPAlpha as the coordenação types (people of the project's team not yet in this camp)
  useEffect(() => {
    if (editing || mode !== "existing") return;
    const q = query.trim();
    if (q.length < 2) {
      setFound([]);
      setSearching(false);
      setSearchError(null);
      return;
    }
    let alive = true;
    setSearching(true);
    const timer = setTimeout(() => {
      searchPeople(token, "equipe", q)
        .then((page) => {
          if (!alive) return;
          rememberPeople(page.items.map((p) => ({ personId: p.personId, name: p.name, nickname: p.nickname, sex: p.sex })));
          setFound(page.items.slice().sort(compareByName));
          setSearchError(null);
        })
        .catch((err) => alive && setSearchError(err instanceof Error ? err.message : tx("Não foi possível buscar agora.")))
        .finally(() => alive && setSearching(false));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, mode, editing, token, tx]);

  // any change from the values the form opened with → ask save/discard before leaving
  const askChoice = useConfirmChoice();
  const snapshot = JSON.stringify([
    mode, picked?.personId, name, phone, sex, homeChurch, hasEmergency, emergencyName, emergencyPhone, emergencyRelation,
    active, roomRole, team, bedroom, transportation, generalNotes,
  ]);
  const initialSnapshot = useRef<string | null>(null);
  if (initialSnapshot.current === null) initialSnapshot.current = snapshot;
  const dirty = initialSnapshot.current !== snapshot;

  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const submitRef = useRef<() => Promise<boolean>>(async () => false);
  useEffect(() => {
    if (!leaveGuardRef) return;
    leaveGuardRef.current = async () => {
      if (!dirtyRef.current) return true;
      const r = await askChoice({
        title: tx("Salvar alterações?"),
        message: tx("Você fez alterações que ainda não foram salvas."),
        confirmLabel: tx("Salvar"),
        discardLabel: tx("Descartar"),
        cancelLabel: tx("Cancelar"),
        emoji: "💾",
      });
      if (r === "cancel") return false;
      if (r === "discard") return true;
      return submitRef.current();
    };
    return () => {
      leaveGuardRef.current = null;
    };
  }, [leaveGuardRef, askChoice, tx]);

  // the phone is how the new person signs in (IPAlpha keeps it — never this app)
  const phoneE164 = toE164(phone);
  const phoneError = !phone.trim() ? tx("Informe o celular: é por ele que a pessoa entra no app.") : !phoneE164 ? tx("Informe um celular válido com DDD.") : null;
  const emergencyE164 = toE164(emergencyPhone);
  const emergencyError = hasEmergency && (!emergencyName.trim() || !emergencyE164) ? tx("Informe o nome e um celular válido com DDD.") : null;

  const valid = editing
    ? true
    : mode === "existing"
      ? !!picked
      : mode === "new"
        ? name.trim().length > 0 && !phoneError && !emergencyError
        : false;

  submitRef.current = handleSubmit;

  async function handleSubmit(e?: React.FormEvent): Promise<boolean> {
    e?.preventDefault();
    if (!valid) return false;
    setError(null);
    const ops: Partial<StaffInput> = {
      active,
      roomRole,
      generalNotes: generalNotes.trim(),
      // when editing, team, room and transport are changed from the detail page (pencil dialogs)
      ...(editing ? {} : { team, bedroom, transportation }),
    };
    try {
      if (editing) await onSubmit?.({ active, roomRole, generalNotes: generalNotes.trim(), team: member.team, bedroom: member.bedroom, transportation: member.transportation });
      else if (mode === "existing" && picked) await onAddExisting?.(picked.personId, ops);
      else if (mode === "new")
        await onRegister?.({
          ...ops,
          name: name.trim(),
          phone: phoneE164!,
          ...(sex ? { sex } : {}),
          ...(homeChurch.trim() ? { homeChurch: homeChurch.trim() } : {}),
          ...(hasEmergency && emergencyE164 ? { emergencyContact: { name: emergencyName.trim(), phone: emergencyE164, ...(emergencyRelation.trim() ? { relation: emergencyRelation.trim() } : {}) } } : {}),
        });
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : tx("Algo deu errado."));
      return false;
    }
  }

  const campOps = (
    <>
      {editing && (
        <div className="cat-form__row staff-form__row">
          <div className="cat-field">
            <span className="cat-field__label">{tx("Status")}</span>
            <Toggle checked={active} onChange={setActive} disabled={busy} label={active ? tx("Ativo") : tx("Inativo")} />
          </div>
        </div>
      )}

      <fieldset className="cat-fieldset">
        <legend className="cat-field__label">{tx("Função no quarto")}</legend>
        <div className="big-options big-options--row">
          {(Object.keys(ROOM_ROLE_META) as RoomRole[]).map((r) => {
            const on = roomRole === r;
            return (
              <button key={r} type="button" className={`big-option ${on ? "big-option--on" : ""}`} aria-pressed={on} disabled={busy} onClick={() => setRoomRole(r)}>
                <span className="big-option__emoji" aria-hidden="true"><RoomRoleIcon role={r} size={32} sex={shownSex ?? "M"} /></span>
                <span className="big-option__label">{tx(ROOM_ROLE_META[r].label)}</span>
                <span className="big-option__hint">{tx(ROOM_ROLE_META[r].hint)}</span>
              </button>
            );
          })}
        </div>
        {editing && member?.roomRole === "caretaker" && roomRole === "helper" && <p className="cat-hint cat-hint--error">{tx("Ao virar auxiliar, as crianças sob sua responsabilidade ficam sem líder.")}</p>}
      </fieldset>

      {!editing && (
        <section className="form-box form-box--plain" aria-labelledby="staff-alloc-title">
          <h3 id="staff-alloc-title" className="form-box__title">{tx("🏕️ Time, quarto e transporte")}</h3>
          <div className="cat-form__row staff-form__row">
            <TeamSelect value={team} onChange={setTeam} disabled={busy} />
            <TransportSelect value={transportation} onChange={setTransportation} disabled={busy} audience="staff" />
          </div>
          <BedroomSelect bedrooms={bedrooms} value={bedroom} onChange={setBedroom} groups={bedroomGroupsForSex(personSex)} disabled={busy} />
        </section>
      )}

      <label className="cat-field cat-field--grow">
        <span className="cat-field__label">{tx("📝 Observações do acampamento")}</span>
        <textarea className="cat-input cat-input--area" rows={3} value={generalNotes} maxLength={500} disabled={busy} placeholder={tx("ex.: chega no sábado à tarde")} onChange={(e) => setGeneralNotes(e.target.value)} />
      </label>
      <p className="cat-hint">{tx("Contato e saúde ficam no cadastro da pessoa no IPAlpha — quem cuida da equipe vê na página dela.")}</p>
    </>
  );

  return (
    <form className="cat-form cat-form--plain" onSubmit={handleSubmit}>
      {!editing && (
        <OptionCards<AddMode>
          label={tx("Como incluir a pessoa")}
          value={mode}
          onChange={(m) => {
            setMode(m);
            setError(null);
          }}
          disabled={busy}
          options={[
            { key: "existing", icon: ICONS.chooseExisting, title: tx("Já está no IPAlpha"), subtitle: tx("Busque quem já faz parte da equipe do acampamento no IPAlpha.") },
            { key: "new", icon: ICONS.createNew, title: tx("Cadastrar pessoa nova"), subtitle: tx("Nome e celular — é por ele que a pessoa entra no app.") },
          ]}
        />
      )}

      {!editing && mode === "existing" && (
        <section className={`form-box form-box--plain ${css.reveal}`} aria-labelledby="staff-find-title">
          <h3 id="staff-find-title" className="form-box__title">{tx("🔎 Quem vai servir")}</h3>
          {picked ? (
            <div className={css.picked}>
              <span className={css.pickedName}>{shownName(picked.name)}</span>
              <button type="button" className="link-btn" disabled={busy} onClick={() => setPicked(null)}>
                {tx("Trocar")}
              </button>
            </div>
          ) : (
            <>
              <SearchField value={query} onChange={setQuery} placeholder={tx("Digite o nome…")} aria-label={tx("Buscar pessoa no IPAlpha")} disabled={busy} autoFocus />
              {searchError && <p className="cat-hint cat-hint--error">{searchError}</p>}
              {query.trim().length < 2 ? (
                <p className="cat-hint">{tx("Digite pelo menos 2 letras do nome.")}</p>
              ) : searching && found.length === 0 ? (
                <p className="cat-hint">{tx("Buscando…")}</p>
              ) : found.length === 0 && !searchError ? (
                <p className="cat-hint">{tx("Ninguém encontrado. Se a pessoa ainda não está no IPAlpha, use “Cadastrar pessoa nova”.")}</p>
              ) : (
                <ul className={`picker__list ${css.results}`} role="listbox" aria-label={tx("Pessoas encontradas")}>
                  {found.map((p) => {
                    const already = onTeam.has(p.personId);
                    return (
                      <li key={p.personId}>
                        <button type="button" role="option" aria-selected={false} className={`picker__item${already ? " picker__item--busy" : ""}`} disabled={busy || already} onClick={() => setPicked(p)}>
                          <span className="picker__name">{shownName(p.name)}</span>
                          {already && <span className="picker__busy">{tx("já está na equipe")}</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </section>
      )}

      {!editing && mode === "new" && (
        <section className={`form-box form-box--plain ${css.reveal}`} aria-labelledby="staff-new-title">
          <h3 id="staff-new-title" className="form-box__title">{tx("👤 Pessoa nova no IPAlpha")}</h3>
          <div className="cat-form__row staff-form__row">
            <label className="cat-field cat-field--grow">
              <span className="cat-field__label">{tx("Nome")}</span>
              <input className="cat-input" placeholder={tx("ex.: Abimael")} value={name} maxLength={80} autoFocus disabled={busy} onChange={(e) => setName(e.target.value)} />
            </label>
            <div className="cat-field cat-field--grow">
              <span className="cat-field__label">{tx("Celular")}</span>
              <PhoneInput
                value={phone}
                onChange={(v) => {
                  setPhoneTouched(true);
                  setPhone(v);
                }}
                disabled={busy}
              />
              {phoneError && <p className={`cat-hint${phoneTouched || phone.trim() ? " cat-hint--error" : ""}`}>{phoneError}</p>}
            </div>
          </div>
          <div className="cat-field">
            <span className="cat-field__label">{tx("Sexo (opcional)")}</span>
            <div className="chip-group" role="radiogroup" aria-label={tx("Sexo (opcional)")}>
              {(
                [
                  ["F", tx("Feminino")],
                  ["M", tx("Masculino")],
                ] as [CamperSex, string][]
              ).map(([key, label]) => (
                <button key={key} type="button" role="radio" aria-checked={sex === key} className={`chip-toggle chip-toggle--small ${sex === key ? "chip-toggle--on" : ""}`} disabled={busy} onClick={() => setSex((cur) => (cur === key ? null : key))}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <label className="cat-field cat-field--grow">
            <span className="cat-field__label">{tx("Igreja onde congrega (opcional)")}</span>
            <input className="cat-input" value={homeChurch} maxLength={120} disabled={busy} placeholder={tx("ex.: IP Alphaville")} onChange={(e) => setHomeChurch(e.target.value)} />
          </label>
          <div className="cat-field opt-field">
            <div className="opt-field__head">
              <Toggle checked={hasEmergency} onChange={setHasEmergency} disabled={busy} label={tx("📞 Contato de emergência (opcional)")} />
            </div>
            {hasEmergency && (
              <div className={`cat-form__row staff-form__row ${css.reveal}`}>
                <label className="cat-field cat-field--grow">
                  <span className="cat-field__label">{tx("Nome do contato")}</span>
                  <input className="cat-input" value={emergencyName} maxLength={80} disabled={busy} onChange={(e) => setEmergencyName(e.target.value)} />
                </label>
                <div className="cat-field cat-field--grow">
                  <span className="cat-field__label">{tx("Celular do contato")}</span>
                  <PhoneInput value={emergencyPhone} onChange={setEmergencyPhone} disabled={busy} />
                </div>
                <label className="cat-field">
                  <span className="cat-field__label">{tx("Quem é (opcional)")}</span>
                  <input className="cat-input" value={emergencyRelation} maxLength={40} disabled={busy} placeholder={tx("ex.: irmã, amigo")} onChange={(e) => setEmergencyRelation(e.target.value)} />
                </label>
              </div>
            )}
            {emergencyError && (emergencyName.trim() || emergencyPhone.trim()) && <p className="cat-hint cat-hint--error">{emergencyError}</p>}
          </div>
        </section>
      )}

      {(editing || mode !== null) && campOps}

      {error && <p className="message message--error">{error}</p>}

      {(editing || mode !== null) && (
        <div className="cat-form__actions">
          <button type="submit" className="button button--primary" disabled={!valid || busy}>
            {busy ? tx("Salvando…") : editing ? tx("Salvar") : tx("Adicionar 🎉")}
          </button>
        </div>
      )}
    </form>
  );
}
