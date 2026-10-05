import RoomRoleIcon from "../../components/RoomRoleIcon";
import { useEffect, useMemo, useRef, useState } from "react";
import { useConfirmChoice } from "../../components/ConfirmDialog";
import { CAMPER_CATEGORY_KEYS, type Camper, type CamperOpsInput, type CamperRegistration, type CamperSex, type HealthInfo } from "../../api/campers";
import { searchPeople } from "../../api/people";
import { useHideScanFab } from "../../scanFab";
import { useCollectionOrEmpty } from "../../store";
import { useLabelOf } from "../../store/derive";
import AiNotesField from "../../components/AiNotesField";
import { useAiNotesSorter } from "../../hooks/useAiNotesSorter";
import { useFieldDedup } from "../../hooks/useFieldDedup";
import type { CamperNotesFields, DedupField } from "../../api/ai";
import type { Category } from "../../api/categories";
import { bedroomGroupsForSex } from "../../api/bedrooms";
import { BedroomSelect, CategoryRadio, TeamSelect, TransportSelect } from "../../components/CategoryFields";
import { HealthFields, draftWeight, healthDraftOf, healthOfDraft, useHealthCategories, type HealthDraft } from "../../components/HealthEditDialog";
import BunkIcon from "../../components/BunkIcon";
import OptionCards from "../../components/OptionCards";
import ParentIcon from "../../components/ParentIcon";
import PhoneInput from "../../components/PhoneInput";
import SearchField from "../../components/SearchField";
import Toggle from "../../components/Toggle";
import { ICONS } from "../../icons";
import { maskBrazilPhone, toE164 } from "../../phone";
import { collatorLocale, useI18n } from "../../i18n";
import styles from "../../components/campers.module.scss";

/** What the form asks the page to do. */
export type CamperFormAction =
  /** a kid already in IPAlpha joins this camp */
  | { kind: "add"; personId: string; ops: CamperOpsInput }
  /** a NEW kid (+ responsável) is registered in IPAlpha and joins */
  | { kind: "register"; input: CamperRegistration & CamperOpsInput }
  /** camp operations of a kid already here */
  | { kind: "update"; patch: CamperOpsInput };

type Path = "existing" | "new";

interface FoundPerson {
  personId: string;
  name: string;
  nickname: string | null;
  sex: CamperSex | null;
}

interface CamperFormProps {
  /** session token — searches IPAlpha and lets the AI organize the observations */
  token: string;
  /** editing: only the camp operations (the person lives in IPAlpha; health on the kid's page) */
  camper?: Camper;
  categories: Category[];
  busy?: boolean;
  onSubmit: (action: CamperFormAction) => Promise<void>;
  /**
   * Set by the form to a guard the parent calls before navigating away (breadcrumbs).
   * Resolves true when navigation may proceed, false to stay on the form.
   */
  leaveGuardRef?: React.MutableRefObject<(() => Promise<boolean>) | null>;
}

const SEARCH_DEBOUNCE_MS = 300;

const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/**
 * Add a kid to the camp — two paths as option cards: "Já está no IPAlpha"
 * (find the church member) or "Cadastrar criança nova" (kid + responsável
 * registered in IPAlpha, health optional). Editing changes camp operations
 * only; health is edited on the kid's page (written to IPAlpha).
 */
export default function CamperForm({ token, camper, categories, busy, onSubmit, leaveGuardRef }: CamperFormProps) {
  const { tx } = useI18n();
  // the "Ler crachá" FAB would sit on top of Salvar / Cancelar
  useHideScanFab();
  const editing = !!camper;
  const cat = (key: string) => categories.find((c) => c.key === key);
  const campers = useCollectionOrEmpty("campers");
  const inCamp = useMemo(() => new Set(campers.map((k) => k.id)), [campers]);

  const [path, setPath] = useState<Path | null>(null);

  // ── path "Já está no IPAlpha" ──
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<FoundPerson[] | null>(null);
  const [more, setMore] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [picked, setPicked] = useState<FoundPerson | null>(null);
  useEffect(() => {
    if (path !== "existing") return;
    const q = query.trim();
    if (q.length < 2) {
      setFound(null);
      setMore(false);
      setSearchError(null);
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      setSearching(true);
      searchPeople(token, "participante", q)
        .then((page) => {
          if (!alive) return;
          setFound(page.items);
          setMore(!!page.nextCursor);
          setSearchError(null);
        })
        .catch((e) => alive && setSearchError(e instanceof Error ? e.message : tx("Algo deu errado.")))
        .finally(() => alive && setSearching(false));
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, path, token]);

  // ── path "Cadastrar criança nova" ──
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [respName, setRespName] = useState("");
  const [respPhone, setRespPhone] = useState("");
  const [withHealth, setWithHealth] = useState(false);
  const [draft, setDraft] = useState<HealthDraft>(() => healthDraftOf(null));

  // ── camp operations (every path) ──
  const [invitedBy, setInvitedBy] = useState(camper?.invitedBy ?? "");
  const [bed, setBed] = useState<string | null>(camper?.bed ?? null);
  const [generalNotes, setGeneralNotes] = useState(camper?.generalNotes ?? "");
  const [bedroomPreference, setBedroomPreference] = useState(camper?.bedroomPreference ?? "");
  // allocation: only on CREATE — when editing, team, room, leader and transport are changed from the kid's page (pencil dialogs)
  const bedrooms = useCollectionOrEmpty("bedrooms");
  const staff = useCollectionOrEmpty("staff");
  const [team, setTeam] = useState<string | null>(camper?.team ?? null);
  const [bedroom, setBedroom] = useState<string | null>(camper?.bedroom ?? null);
  const [caretakerId, setCaretakerId] = useState<string | null>(camper?.caretakerId ?? null);
  const [transportation, setTransportation] = useState<string | null>(camper?.transportation ?? null);
  // sex comes from IPAlpha with the name (decision 39) — known for an existing person, unknown for a new one
  const sex: CamperSex | null = editing ? camper.sex : path === "existing" ? (picked?.sex ?? null) : null;
  /** the líderes of the chosen room: the only people who may look after the kid */
  const caretakers = useMemo(
    () => (bedroom ? staff.filter((s) => s.bedroom === bedroom && s.roomRole === "caretaker").sort((a, b) => a.name.localeCompare(b.name, collatorLocale())) : []),
    [staff, bedroom],
  );
  // one líder → picked for you; room changed → a líder from elsewhere is dropped
  useEffect(() => {
    if (editing) return;
    if (caretakers.length === 1) setCaretakerId(caretakers[0].id);
    else if (!caretakers.some((s) => s.id === caretakerId)) setCaretakerId(null);
  }, [caretakers, caretakerId, editing]);

  const [error, setError] = useState<string | null>(null);

  // any change from the values the form opened with → ask save/discard before leaving
  const askChoice = useConfirmChoice();
  const snapshot = JSON.stringify([path, picked?.personId, name, birthDate, respName, respPhone, withHealth, draft, invitedBy, bed, generalNotes, bedroomPreference, team, bedroom, caretakerId, transportation]);
  const initialSnapshot = useRef<string | null>(null);
  if (initialSnapshot.current === null) initialSnapshot.current = snapshot;
  const dirty = initialSnapshot.current !== snapshot;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
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
      return submitRef.current(); // save; proceed only if it succeeded
    };
    return () => {
      leaveGuardRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaveGuardRef, askChoice]);

  const phoneE164 = toE164(respPhone);
  const healthOk = !withHealth || draftWeight(draft).ok;
  const valid = editing ? true : path === "existing" ? !!picked && !inCamp.has(picked.personId) : path === "new" ? name.trim().length > 1 && !!birthDate && respName.trim().length > 1 && !!phoneE164 && healthOk : false;

  // ✨ background "remove repeats" on individual free-text fields (fires on blur and after the sorter fills them)
  const dedup = useFieldDedup({ token, busy });

  // ✨ new kid: the observations pasted from the registration are spread over the health / responsável fields
  const labelOf = useLabelOf();
  const healthCat = useHealthCategories(token);
  /** the sorter answers Acampa category ids → the church option with the same label (the server maps any left over) */
  const toChurch = (ids: string[], key: string): string[] => {
    const options = healthCat(key)?.options ?? [];
    return ids.map((id) => {
      const label = normalize(labelOf(id) ?? "");
      return (label && options.find((o) => normalize(o.label) === label)?.id) || id;
    });
  };
  const ai = useAiNotesSorter({
    token,
    subject: "camper",
    initialNotes: camper?.generalNotes ?? "",
    busy: busy || editing,
    getCurrent: (): Partial<CamperNotesFields> => {
      const h = healthOfDraft(draft);
      return {
        ...(withHealth ? { allergies: h.allergies, drugAllergies: h.drugAllergies, healthIssues: h.healthIssues, neurodivergent: h.neurodivergent, medications: h.medications, foodRestrictions: h.foodRestrictions, healthNotes: h.healthNotes, weightKg: h.weightKg, insurance: h.insurance, insuranceCard: h.insuranceCard } : {}),
        bedroomPreference,
        invitedBy,
        guardianName: respName,
        guardianPhone: respPhone,
      };
    },
    apply: (f) => {
      const healthFound = f.allergies.length || f.drugAllergies.length || f.healthIssues.length || f.neurodivergent || f.medications.length || f.foodRestrictions || f.healthNotes || f.weightKg != null || f.insurance || f.insuranceCard;
      if (healthFound) {
        setWithHealth(true);
        setDraft((p) => {
          const health: HealthInfo = { ...p.health };
          const on = { ...p.on };
          if (f.allergies.length) [health.allergies, on.allergies] = [toChurch(f.allergies, CAMPER_CATEGORY_KEYS.allergies), true];
          if (f.drugAllergies.length) [health.drugAllergies, on.drugAllergies] = [toChurch(f.drugAllergies, CAMPER_CATEGORY_KEYS.drugAllergies), true];
          if (f.healthIssues.length) [health.healthIssues, on.healthIssues] = [toChurch(f.healthIssues, CAMPER_CATEGORY_KEYS.healthIssues), true];
          if (f.neurodivergent) health.neurodivergent = true;
          if (f.medications.length) [health.medications, on.medications] = [f.medications, true];
          if (f.foodRestrictions) [health.foodRestrictions, on.foodRestrictions] = [f.foodRestrictions, true];
          if (f.healthNotes) [health.healthNotes, on.healthNotes] = [f.healthNotes, true];
          if (f.insurance) health.insurance = f.insurance;
          if (f.insuranceCard) health.insuranceCard = f.insuranceCard;
          return { health, on, weight: f.weightKg != null ? String(f.weightKg).replace(".", ",") : p.weight };
        });
      }
      if (f.bedroomPreference) setBedroomPreference(f.bedroomPreference);
      if (f.invitedBy) setInvitedBy(f.invitedBy);
      if (f.guardianName && !respName.trim()) setRespName(f.guardianName);
      if (f.guardianPhone && !respPhone.trim()) setRespPhone(maskBrazilPhone(f.guardianPhone.replace(/^\+?55/, "")));
      setGeneralNotes(f.generalNotes);
      dedup.runMany([
        { field: "bedroomPreference", value: f.bedroomPreference, apply: setBedroomPreference },
        { field: "generalNotes", value: f.generalNotes, apply: setGeneralNotes },
      ]);
    },
  });

  const submitRef = useRef<() => Promise<boolean>>(async () => false);
  submitRef.current = handleSubmit;

  async function handleSubmit(e?: React.FormEvent): Promise<boolean> {
    e?.preventDefault();
    if (!valid || ai.holding) return false;
    // the sorter had its 8 seconds: whatever it hasn't finished is dropped and the form saves as it is
    ai.cancel();
    dedup.cancelAll();
    setError(null);
    const common: CamperOpsInput = { invitedBy: invitedBy.trim(), bed, generalNotes: generalNotes.trim(), bedroomPreference: bedroomPreference.trim() };
    const allocation: CamperOpsInput = { team, bedroom, caretakerId, transportation };
    try {
      if (editing) await onSubmit({ kind: "update", patch: common });
      else if (path === "existing" && picked) await onSubmit({ kind: "add", personId: picked.personId, ops: { ...common, ...allocation } });
      else if (path === "new") {
        await onSubmit({
          kind: "register",
          input: { name: name.trim(), birthDate, responsible: { name: respName.trim(), phone: phoneE164! }, ...(withHealth ? { health: healthOfDraft(draft) } : {}), ...common, ...allocation },
        });
      } else return false;
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : tx("Algo deu errado."));
      return false;
    }
  }

  /** a labelled text field; pass `dedupAs` to run the background repeat clean-up on blur (pulses while it runs) */
  const text = (label: React.ReactNode, value: string, set: (v: string) => void, placeholder = "", rows?: number, dedupAs?: DedupField) => {
    const cls = `cat-input${rows ? " cat-input--area" : ""}${dedupAs && dedup.busy(dedupAs) ? " cat-input--busy" : ""}`;
    const onBlur = dedupAs ? () => void dedup.run(dedupAs, value, set) : undefined;
    return (
      <label className="cat-field cat-field--grow">
        <span className="cat-field__label">{label}</span>
        {rows ? (
          <textarea className={cls} rows={rows} value={value} placeholder={placeholder} maxLength={1000} disabled={busy} onChange={(e) => set(e.target.value)} onBlur={onBlur} />
        ) : (
          <input className={cls} value={value} placeholder={placeholder} maxLength={120} disabled={busy} onChange={(e) => set(e.target.value)} onBlur={onBlur} />
        )}
      </label>
    );
  };

  const showOps = editing || path !== null;

  return (
    <form className="cat-form cat-form--plain" onSubmit={handleSubmit}>
      {!editing && (
        <OptionCards<Path>
          label={tx("Como adicionar a criança")}
          row
          disabled={busy}
          value={path}
          onChange={(p) => {
            setPath(p);
            setError(null);
          }}
          options={[
            { key: "existing", icon: ICONS.chooseExisting, title: tx("Já está no IPAlpha"), subtitle: tx("A criança já tem cadastro na igreja") },
            { key: "new", icon: ICONS.createNew, title: tx("Cadastrar criança nova"), subtitle: tx("Cadastramos a criança e o responsável no IPAlpha") },
          ]}
        />
      )}

      {editing && <p className="cat-hint">{tx("Aqui ficam só os dados do acampamento. Nome e família vêm do IPAlpha; a saúde é editada na página da criança.")}</p>}

      {path === "existing" && (
        <section className={`form-box form-box--plain ${styles.pathPanel}`} aria-labelledby="find-title">
          <h3 id="find-title" className="form-box__title">{tx("🔎 Encontrar a criança")}</h3>
          <SearchField placeholder={tx("Nome da criança")} value={query} onChange={setQuery} aria-label={tx("Buscar no IPAlpha")} autoFocus />
          {searching && <p className="cat-hint">{tx("Buscando…")}</p>}
          {searchError && <p className="message message--error">{searchError}</p>}
          {!searching && found && found.length === 0 && <p className="opt-empty">{tx("Ninguém com esse nome entre as crianças do IPAlpha. Que tal cadastrar como criança nova?")}</p>}
          {found && found.length > 0 && (
            <ul className={styles.searchResults} role="listbox" aria-label={tx("Crianças encontradas")}>
              {found.map((p) => {
                const already = inCamp.has(p.personId);
                const on = picked?.personId === p.personId;
                return (
                  <li key={p.personId}>
                    <button type="button" role="option" aria-selected={on} className={`${styles.searchResult} ${on ? styles.searchResultOn : ""}`} disabled={busy || already} onClick={() => setPicked(p)}>
                      <span className={styles.searchResultName}>
                        {p.name}
                        {p.nickname && <span className="cat-hint"> · {p.nickname}</span>}
                      </span>
                      {already && <span className="staff-tag staff-tag--soft">{tx("Já está no acampamento")}</span>}
                      {on && <span aria-hidden="true">✓</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {more && <p className="cat-hint">{tx("Há mais resultados — digite mais do nome para encontrar.")}</p>}
        </section>
      )}

      {path === "new" && (
        <section className={`form-box form-box--plain ${styles.pathPanel}`} aria-labelledby="new-title">
          <h3 id="new-title" className="form-box__title">{tx("🌱 A criança")}</h3>
          <div className="cat-form__row staff-form__row staff-form__row--inline">
            <label className="cat-field cat-field--grow">
              <span className="cat-field__label">{tx("Nome")}</span>
              <input className="cat-input" placeholder={tx("ex.: Helena Sparvoli")} value={name} maxLength={100} autoFocus disabled={busy} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="cat-field">
              <span className="cat-field__label">{tx("Nascimento")}</span>
              <input className="cat-input" type="date" value={birthDate} disabled={busy} onChange={(e) => setBirthDate(e.target.value)} />
            </label>
          </div>
          <h3 className="form-box__title">
            <ParentIcon size={22} /> {tx("Responsável pela criança")}
          </h3>
          <div className="cat-form__row staff-form__row">
            {text(tx("Nome do responsável"), respName, setRespName, tx("ex.: Daniela Sparvoli"))}
            <div className="cat-field cat-field--grow">
              <span className="cat-field__label">{tx("Celular do responsável")}</span>
              <PhoneInput value={respPhone} onChange={setRespPhone} disabled={busy} />
              {respPhone && !phoneE164 && <p className="cat-hint cat-hint--error">{tx("Informe um celular válido com DDD.")}</p>}
            </div>
          </div>
          <p className="cat-hint">{tx("Outro responsável pode ser adicionado depois, na página da criança.")}</p>
          <div className="cat-field opt-field">
            <div className="opt-field__head">
              <Toggle checked={withHealth} onChange={setWithHealth} disabled={busy} label={tx("🩺 Informar a saúde agora")} />
            </div>
            <p className="cat-hint">{tx("Fica no IPAlpha e só a coordenação e a equipe de cuidado veem.")}</p>
          </div>
          {withHealth && (
            <div className={styles.pathPanel}>
              <HealthFields token={token} value={draft} onChange={setDraft} disabled={busy} dedup={dedup} />
            </div>
          )}
        </section>
      )}

      {showOps && (
        <>
          <div className="cat-form__row staff-form__row">
            <CategoryRadio label={tx("Cama")} category={cat(CAMPER_CATEGORY_KEYS.bed)} value={bed} onChange={setBed} disabled={busy} />
            {text(<><BunkIcon size={18} /> {tx("Prefere dividir quarto com")}</>, bedroomPreference, setBedroomPreference, tx("ex.: Bernardo Faria, Lucas (primo)"), undefined, "bedroomPreference")}
          </div>

          {!editing && (
            <section className="form-box form-box--plain" aria-labelledby="alloc-title">
              <h3 id="alloc-title" className="form-box__title">{tx("🏕️ Time, quarto e transporte")}</h3>
              <div className="cat-form__row staff-form__row">
                <TeamSelect value={team} onChange={setTeam} disabled={busy} />
                <TransportSelect value={transportation} onChange={setTransportation} disabled={busy} />
              </div>
              <div className="cat-form__row staff-form__row">
                <BedroomSelect bedrooms={bedrooms} value={bedroom} onChange={setBedroom} groups={bedroomGroupsForSex(sex, null)} disabled={busy} />
                <label className="cat-field cat-field--grow">
                  <span className="cat-field__label">
                    <RoomRoleIcon role="caretaker" sex={sex ?? "M"} /> {tx("Líder")}
                  </span>
                  <select className="cat-input" value={caretakerId ?? ""} disabled={busy || !bedroom || caretakers.length === 0} onChange={(e) => setCaretakerId(e.target.value || null)}>
                    <option value="">{!bedroom ? tx("Escolha o quarto primeiro") : caretakers.length ? tx("Sem líder") : tx("Nenhum líder neste quarto")}</option>
                    {caretakers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name || tx("Carregando nome…")}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </section>
          )}

          <section className="form-box form-box--plain" aria-labelledby="notes-title">
            <h3 id="notes-title" className="form-box__title">{tx("📝 Observações")}</h3>
            {text(tx("Convidado por"), invitedBy, setInvitedBy, tx("ex.: Pedro Brassioli"))}
            {path === "new" ? (
              <AiNotesField
                label={tx("📝 Observações gerais")}
                value={generalNotes}
                onChange={setGeneralNotes}
                placeholder={tx("ex.: cole aqui o texto da inscrição — saúde, responsável e preferências vão para os campos certos")}
                disabled={busy}
                sorter={ai}
              />
            ) : (
              text(tx("📝 Observações gerais"), generalNotes, setGeneralNotes, tx("ex.: chega no sábado à tarde"), 3, "generalNotes")
            )}
          </section>
        </>
      )}

      {error && <p className="message message--error">{error}</p>}

      {showOps && (
        <div className="cat-form__actions">
          <button type="submit" className="button button--primary" disabled={!valid || busy || ai.holding} title={ai.holding ? tx("Aguardando a IA organizar as observações…") : undefined}>
            {busy ? tx("Salvando…") : ai.holding ? tx("Organizando…") : editing ? tx("Salvar") : tx("Adicionar 🎉")}
          </button>
        </div>
      )}
    </form>
  );
}
