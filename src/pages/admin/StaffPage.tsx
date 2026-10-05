import { useConfirm } from "../../components/ConfirmDialog";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GROUP_META, bedroomLabel } from "../../api/bedrooms";
import {
  ROOM_ROLE_META,
  addStaff,
  deleteStaff,
  registerStaff,
  staffSex,
  updateStaff,
  type Staff,
  type StaffInput,
  type StaffRegistration,
} from "../../api/staff";
import { useCollection, useCollectionOrEmpty } from "../../store";
import { rememberPeople } from "../../store/people";
import { useLabelOf } from "../../store/derive";
import DetailStack from "./DetailStack";
import { useRoute } from "../../router";
import HealthHeart from "../../components/HealthHeart";
import PersonContact from "../../components/PersonContact";
import { downloadStaffXlsx } from "../../export";
import type { CamperSex } from "../../api/campers";
import { ICONS } from "../../icons";

import Breadcrumbs from "../../components/Breadcrumbs";
import StaffForm from "./StaffForm";
import GiveawayPage from "../GiveawayPage";
import ImportYearPage from "./ImportYearPage";
import { DownloadGlyph } from "../../components/Glyph";
import SearchField from "../../components/SearchField";
import BedroomTag from "../../components/BedroomTag";
import GroupIcon from "../../components/GroupIcon";
import ImportSourceDialog from "../../components/ImportSourceDialog";
import ImportConflictsCard from "../../components/ImportConflictsCard";
import TeamFilterDialog from "../../components/TeamFilterDialog";
import RoomRoleIcon from "../../components/RoomRoleIcon";
import TeamTag from "../../components/TeamTag";
import TransportTag from "../../components/TransportTag";
import Toast from "../../components/Toast";
import { loadAuth, type CampSummary } from "../../auth/store";
import StaffImportPage from "./StaffImportPage";
import { setPendingImportFile, useWindowFileDrop } from "../../hooks/useFileDrop";
import { takePendingToast } from "../../pendingToast";
import { useI18n } from "../../i18n";
import { compareByName, firstNameOf, shownName } from "./staffNames";
import css from "./staffGroup.module.scss";

interface StaffPageProps {
  token: string;
  camp: CampSummary;
  /** every camp this session may switch into — empty when it can't switch years */
  camps: CampSummary[];
  /** organizers: see everything, filter and open people, but no create / edit / delete / Excel */
  readOnly?: boolean;
}

/** URL → what to show:  /staff · /staff/new · /staff/giveaway · /staff/:id · /staff/:id/edit · /staff/import-year */
type Mode = { kind: "view" } | { kind: "create" } | { kind: "giveaway" } | { kind: "import" } | { kind: "import-year" } | { kind: "edit"; id: string } | { kind: "detail"; id: string };
function modeOf(segments: string[]): Mode {
  const [, id, action] = segments;
  if (!id) return { kind: "view" };
  if (id === "new") return { kind: "create" };
  if (id === "giveaway") return { kind: "giveaway" };
  if (id === "import") return { kind: "import" };
  if (id === "import-year") return { kind: "import-year" };
  if (action === "edit") return { kind: "edit", id };
  return { kind: "detail", id };
}

/** who sleeps in a kids' wing (the "tias" / "tios"); the staff wing is not a filter */
type Wing = "all" | "girls" | "boys";

/** The camp staff (equipe) list + create/edit form (admin); read-only for programme organizers. */
export default function StaffPage({ token, camp, camps, readOnly = false }: StaffPageProps) {
  const { tx } = useI18n();
  const otherCamps = useMemo(() => camps.filter((c) => c.id !== camp.id), [camps, camp.id]);
  const [importSheetOpen, setImportSheetOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(() => takePendingToast());
  // everything comes from the local store (localStorage + live WebSocket feed)
  const staff = useCollection("staff");
  const bedrooms = useCollectionOrEmpty("bedrooms");
  const labelOf = useLabelOf();
  const { segments, navigate } = useRoute();
  /** read-only: the create / edit URLs fall back to the list */
  const rawMode = modeOf(segments);
  const mode: Mode = readOnly && (rawMode.kind === "create" || rawMode.kind === "edit" || rawMode.kind === "giveaway" || rawMode.kind === "import" || rawMode.kind === "import-year") ? { kind: "view" } : rawMode;
  const confirm = useConfirm();
  // set by the open form; asks save/discard before a breadcrumb navigation leaves the form
  const leaveGuardRef = useRef<(() => Promise<boolean>) | null>(null);
  async function guardedNav(to: string) {
    const guard = leaveGuardRef.current;
    if (guard && !(await guard())) return;
    navigate(to);
  }
  const [search, setSearch] = useState("");
  const [wing, setWing] = useState<Wing>("all");
  /** team ids to show — empty = every team */
  const [teamFilter, setTeamFilter] = useState<Set<string>>(new Set());
  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  /** tap "sem quarto" in the intro to bubble those cards to the top */
  const [noRoomFirst, setNoRoomFirst] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** the Excel is being prepared: null = idle; {done,total} while each person is read live */
  const [exporting, setExporting] = useState<{ done: number; total: number } | null>(null);
  const [createSex, setCreateSex] = useState<CamperSex | null>(null);
  const onCreateSex = useCallback((sex: CamperSex | null) => setCreateSex(sex), []);
  useEffect(() => {
    if (mode.kind !== "create") setCreateSex(null);
  }, [mode.kind]);

  /** bedroom id → "Meninos - 403" */
  const bedroomOf = useMemo(() => {
    const map = new Map(bedrooms.map((b) => [b.id, bedroomLabel(b)]));
    return (id: string | null | undefined) => (id ? (map.get(id) ?? null) : null);
  }, [bedrooms]);
  /** bedroom id → wing */
  const wingOf = useMemo(() => {
    const map = new Map(bedrooms.map((b) => [b.id, b.group]));
    return (id: string | null | undefined) => (id ? (map.get(id) ?? null) : null);
  }, [bedrooms]);
  const roomById = useMemo(() => new Map(bedrooms.map((b) => [b.id, b])), [bedrooms]);
  const teams = useCollectionOrEmpty("teams");
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  async function withBusy<T>(fn: () => Promise<T>): Promise<T> {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } finally {
      setBusy(false);
    }
  }

  /** "Já está no IPAlpha": the person joins this camp's team */
  async function handleAddExisting(personId: string, ops: Partial<StaffInput>) {
    const created = await withBusy(() => addStaff(token, personId, ops));
    navigate(`/staff/${created.id}`, { replace: true });
  }

  /** "Cadastrar pessoa nova": registered in IPAlpha + equipe membership + the camp-ops row */
  async function handleRegister(input: StaffRegistration) {
    const res = await withBusy(() => registerStaff(token, input));
    if (res.staff.name) rememberPeople([{ personId: res.staff.id, name: res.staff.name, sex: input.sex ?? undefined }]);
    // the phone already belonged to someone in IPAlpha: that person joined, nothing was duplicated
    if (!res.created) setToast(tx("Este celular já era de alguém no IPAlpha: essa pessoa entrou na equipe."));
    navigate(`/staff/${res.staff.id}`, { replace: true });
  }

  /** the Excel of the team — only what this role may see, read live right now */
  async function handleExport() {
    if (!staff) return;
    const role = loadAuth()?.user.activeRole;
    setExporting({ done: 0, total: 0 });
    setError(null);
    try {
      await downloadStaffXlsx(
        { token, healthAllowed: role === "coordenacao" || role === "saude", contactsAllowed: role === "coordenacao", onProgress: (done, total) => setExporting({ done, total }) },
        staff,
        bedrooms,
        labelOf,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : tx("Algo deu errado."));
    } finally {
      setExporting(null);
    }
  }

  async function handleEdit(input: StaffInput) {
    if (mode.kind !== "edit") return;
    const updated = await withBusy(() => updateStaff(token, mode.id, input));
    navigate(`/staff/${updated.id}`, { replace: true });
  }

  async function handleDelete(member: Staff) {
    if (!(await confirm({ emoji: "🗑️", title: tx("Tirar {name} da equipe?", { name: shownName(member.name) }), message: tx("A pessoa sai da equipe deste acampamento. O cadastro dela no IPAlpha continua."), confirmLabel: tx("Tirar da equipe"), danger: true }))) return;
    try {
      await withBusy(() => deleteStaff(token, member.id));
      navigate("/staff", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : tx("Algo deu errado."));
    }
  }

  const visible = useMemo(() => {
    if (!staff) return [];
    const q = normalize(search);
    const list = sortByName(staff).filter((s) => {
      if (wing !== "all" && wingOf(s.bedroom) !== wing) return false;
      if (teamFilter.size > 0 && !(s.team && teamFilter.has(s.team))) return false;
      if (!q) return true;
      const hay = normalize(
        [s.name, s.nickname, labelOf(s.team), bedroomOf(s.bedroom), labelOf(s.transportation)].filter(Boolean).join(" "),
      );
      return hay.includes(q);
    });
    // only bubble "sem quarto" when the intro tag is toggled on
    if (noRoomFirst) list.sort((a, b) => Number(!!a.bedroom) - Number(!!b.bedroom));
    return list;
  }, [staff, search, wing, teamFilter, labelOf, bedroomOf, wingOf, noRoomFirst]);
  const noRoomCount = useMemo(() => (staff ?? []).filter((s) => !s.bedroom).length, [staff]);

  /** people per wing (by the room they sleep in) */
  const wingCounts = useMemo(() => {
    const c: Record<Wing, number> = { all: staff?.length ?? 0, girls: 0, boys: 0 };
    for (const s of staff ?? []) {
      const g = wingOf(s.bedroom);
      if (g === "girls" || g === "boys") c[g]++;
    }
    return c;
  }, [staff, wingOf]);
  /** people per team (for the chips in the team dialog) */
  const teamCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of staff ?? []) if (s.team) m.set(s.team, (m.get(s.team) ?? 0) + 1);
    return m;
  }, [staff]);
  const teamChipLabel = teamFilter.size === 0 ? tx("Todos os times") : [...teamFilter].map((id) => teamById.get(id)?.name).filter(Boolean).join(", ");
  const canDropImport = !readOnly && mode.kind === "view" && !!staff && staff.length === 0;
  const emptyDropOver = useWindowFileDrop((file) => {
    setPendingImportFile(file);
    navigate("/staff/import");
  }, canDropImport);

  // ── render ─────────────────────────────────────────────────────────────

  if (!staff) {
    return (
      <div className="admin-page admin-page--staff">
        {error ? <p className="message message--error">{error}</p> : <p className="opt-empty">{tx("Sincronizando com o servidor… 🏕️")}</p>}
      </div>
    );
  }

  if (mode.kind === "giveaway") {
    return <GiveawayPage who="staff" crumbs={[{ label: tx("Equipe"), onClick: () => navigate("/staff") }, { label: tx("Sorteio") }]} />;
  }
  if (mode.kind === "import") return <StaffImportPage token={token} onBack={() => navigate("/staff")} />;
  if (mode.kind === "import-year") {
    return <ImportYearPage kind="staff" token={token} otherCamps={otherCamps} onBack={() => navigate("/staff")} onDone={() => navigate("/staff", { replace: true })} />;
  }

  if (mode.kind === "detail") {
    return (
      <>
        <DetailStack
          token={token}
          current={{ kind: "staff", id: mode.id }}
          rootCrumbs={[{ label: tx("Equipe"), onClick: () => navigate("/staff") }]}
          onEditStaff={readOnly ? undefined : (member) => navigate(`/staff/${member.id}/edit`)}
        />
        <Toast message={toast} onClose={() => setToast(null)} />
      </>
    );
  }

  const editing = mode.kind === "edit" ? staff.find((s) => s.id === mode.id) : undefined;

  return (
    <div className="admin-page admin-page--staff">
      {mode.kind === "create" && <Breadcrumbs items={[{ label: tx("Equipe"), onClick: () => guardedNav("/staff") }, { label: tx("Novo") }]} />}
      {mode.kind === "edit" && editing && (
        <Breadcrumbs items={[{ label: tx("Equipe"), onClick: () => guardedNav("/staff") }, { label: firstNameOf(editing.name), onClick: () => guardedNav(`/staff/${editing.id}`) }, { label: tx("Editar") }]} />
      )}
      <header className="admin-head">
        <h1 className="admin-title">
          {mode.kind === "create" ? (
            <>
              <img className="admin-title__icon" src={createSex === "M" ? ICONS.man : ICONS.woman} alt="" aria-hidden="true" /> <span>{tx("Novo membro da equipe")}</span>
            </>
          ) : mode.kind === "edit" ? (
            tx("✏️ Editar membro da equipe")
          ) : (
            tx("Equipe")
          )}
        </h1>
        {mode.kind === "view" && !readOnly && (
          <div className="admin-head__actions admin-head__actions--icons">
            <button
              type="button"
              className="button button--secondary admin-head__new"
              title={tx("Sorteio")}
              aria-label={tx("Sorteio")}
              onClick={() => navigate("/staff/giveaway")}
            >
              <img className="admin-head__action-icon" src={ICONS.giveaway} alt="" aria-hidden="true" />
              <span className="admin-head__action-label">{tx("Sorteio")}</span>
            </button>
            <button
              type="button"
              className="button button--secondary admin-head__new"
              disabled={busy}
              title={tx("Importar equipe")}
              aria-label={tx("Importar equipe")}
              onClick={() => (otherCamps.length > 0 ? setImportSheetOpen(true) : navigate("/staff/import"))}
            >
              <img className="admin-head__action-icon" src={ICONS.importCampers} alt="" aria-hidden="true" />
              <span className="admin-head__action-label">{tx("Importar")}</span>
            </button>
            <button
              type="button"
              className="button button--secondary admin-head__new"
              disabled={busy || !!exporting || staff.length === 0}
              title={tx("Baixar toda a equipe em Excel")}
              aria-label={tx("Baixar toda a equipe em Excel")}
              aria-busy={!!exporting}
              onClick={() => void handleExport()}
            >
              <DownloadGlyph />
              <span className="admin-head__action-label">{exporting ? (exporting.total ? tx("Preparando {done}/{total}…", { done: exporting.done, total: exporting.total }) : tx("Preparando…")) : tx("Download")}</span>
            </button>
            <button
              type="button"
              className="button button--primary admin-head__new"
              disabled={busy}
              title={tx("Novo membro da equipe")}
              aria-label={tx("Novo membro da equipe")}
              onClick={() => navigate("/staff/new")}
            >
              <span className="admin-head__action-plus" aria-hidden="true">+</span>
              <span className="admin-head__action-label">{tx("Novo")}</span>
            </button>
          </div>
        )}
        {mode.kind === "edit" && editing && (
          <button
            type="button"
            className="icon-btn icon-btn--lg icon-btn--danger"
            title={tx("Tirar {name} da equipe", { name: shownName(editing.name) })}
            aria-label={tx("Tirar {name} da equipe", { name: shownName(editing.name) })}
            disabled={busy}
            onClick={() => handleDelete(editing)}
          >
            🗑️
          </button>
        )}
      </header>

      {error && <p className="message message--error">{error}</p>}

      {mode.kind === "view" && !readOnly && (
        <ImportSourceDialog
          open={importSheetOpen}
          onClose={() => setImportSheetOpen(false)}
          sheetIcon={ICONS.staffPair}
          onPickSheet={() => { setImportSheetOpen(false); navigate("/staff/import"); }}
          onPickYear={() => { setImportSheetOpen(false); navigate("/staff/import-year"); }}
        />
      )}
      <Toast message={toast} onClose={() => setToast(null)} />

      {mode.kind === "create" && (
        <StaffForm
          token={token}
          busy={busy}
          onAddExisting={handleAddExisting}
          onRegister={handleRegister}
          onSexChange={onCreateSex}
          leaveGuardRef={leaveGuardRef}
        />
      )}
      {mode.kind === "edit" && !editing && <p className="opt-empty">{tx("Pessoa não encontrada.")}</p>}
      {mode.kind === "edit" && editing && (
        <StaffForm
          token={token}
          key={editing.id}
          member={editing}
          busy={busy}
          onSubmit={handleEdit}
          leaveGuardRef={leaveGuardRef}
        />
      )}

      {mode.kind === "view" && (
        <>
          {/* decision 78: import values a manual edit kept aside — the organização chooses which one stays */}
          {!readOnly && camp.active && <ImportConflictsCard token={token} subject="team" />}
          <div className="staff-toolbar">
            <SearchField placeholder={tx("Buscar por nome, time, quarto…")} value={search} onChange={setSearch} aria-label={tx("Buscar")} />
          </div>
          <div className="health-filter" role="group" aria-label={tx("Ala e time")}>
            {(
              [
                ["all", tx("Todos")],
                ["girls", tx("Tia de meninas")],
                ["boys", tx("Tio de meninos")],
              ] as [Wing, string][]
            ).map(([key, label]) => (
              <button key={key} type="button" className={`chip-toggle chip-toggle--small ${wing === key ? "chip-toggle--on" : ""}`} aria-pressed={wing === key} title={key === "all" ? undefined : tx("Dorme no quarto de {group}", { group: GROUP_META[key].label.toLowerCase() })} onClick={() => setWing(key)}>
                {key !== "all" && <GroupIcon group={key} face />}
                {label}
                <span className="cat-tab__count">{wingCounts[key]}</span>
              </button>
            ))}
            {teams.length > 0 && (
              <button type="button" className={`chip-toggle chip-toggle--small ${teamFilter.size > 0 ? "chip-toggle--on" : ""}`} aria-pressed={teamFilter.size > 0} title={tx("Filtrar por time")} onClick={() => setTeamDialogOpen(true)}>
                🚩 {teamChipLabel}
                {teamFilter.size > 0 && <span className="cat-tab__count">{visible.length}</span>}
              </button>
            )}
          </div>
          <TeamFilterDialog open={teamDialogOpen} teams={teams} value={teamFilter} counts={teamCounts} onChange={setTeamFilter} onClose={() => setTeamDialogOpen(false)} />

          {staff.length === 0 && (
            <div className={`admin-empty${canDropImport ? " admin-empty--drop" : ""}${canDropImport && emptyDropOver ? " admin-empty--over" : ""}`}>
              <img className="admin-empty__icon" src={ICONS.staff} alt="" aria-hidden="true" />
              <p>{tx("Ninguém na equipe ainda.")}{!readOnly && ` ${tx("Cadastre o primeiro voluntário!")}`}</p>
              {!readOnly && (
                <button type="button" className="button button--primary" onClick={() => navigate("/staff/new")}>
                  {tx("+ Adicionar membro")}
                </button>
              )}
            </div>
          )}

          {staff.length > 0 && visible.length === 0 && <p className="opt-empty">{tx("Nenhum resultado. 🔍")}</p>}

          <p className="admin-intro">
            {visible.length === staff.length ? tx("{count} pessoas", { count: staff.length }) : tx("{visible} de {total} pessoas", { visible: visible.length, total: staff.length })}
            {noRoomCount > 0 && (
              <>
                {" · "}
                <button
                  type="button"
                  className={`orphan-tag orphan-tag--btn ${noRoomFirst ? "orphan-tag--on" : ""}`}
                  aria-pressed={noRoomFirst}
                  title={noRoomFirst ? tx("Voltar à ordem alfabética") : tx("Mostrar sem quarto no topo")}
                  onClick={() => setNoRoomFirst((v) => !v)}
                >
                  ⚠️ {tx("{count} sem quarto", { count: noRoomCount })}
                </button>
              </>
            )}
          </p>

          <ul className="staff-list">
            {visible.map((s) => {
              const room = s.bedroom ? roomById.get(s.bedroom) : null;
              const noRoom = !s.bedroom;

              return (
                <li key={s.id} className={`staff-card staff-card--clickable staff-card--cover ${noRoom ? "staff-card--orphan" : ""} ${s.active ? "" : "staff-card--inactive"}`}>
                  <div
                    className="staff-card__body"
                    role="link"
                    tabIndex={0}
                    title={tx("Ver {name}", { name: shownName(s.name) })}
                    onClick={() => navigate(`/staff/${s.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate(`/staff/${s.id}`);
                      }
                    }}
                  >
                    <h3 className="staff-card__name">
                      <span className={s.name ? undefined : css.pendingName} title={s.name ? undefined : tx("Carregando nome…")}>{shownName(s.name)}</span>
                      <HealthHeart show={s.hasHealth} />
                      {!s.active && <span className="staff-card__inactive">{tx("inativo")}</span>}
                    </h3>
                    {noRoom && <p className="staff-card__meta orphan-msg">⚠️ {tx("Esta pessoa está sem quarto.")}</p>}
                    {(room || s.team || s.transportation) && (
                      <div className="staff-card__tags">
                        {room && <BedroomTag bedroom={room} />}
                        {room && (
                          <span className="staff-tag" title={tx("Função no quarto")}>
                            <RoomRoleIcon role={s.roomRole} sex={staffSex(s, bedrooms)} /> {tx(ROOM_ROLE_META[s.roomRole].label)}
                          </span>
                        )}
                        <TeamTag teamId={s.team} />
                        <TransportTag transportId={s.transportation} short className="staff-tag--pill" />
                      </div>
                    )}
                  </div>
                  {/* phones are never in the records: read from IPAlpha only when someone taps */}
                  <span className={css.cardContact}>
                    <PersonContact token={token} personId={s.id} name={s.name} compact />
                  </span>
                  <button
                    type="button"
                    className="icon-btn icon-btn--lg staff-card__edit"
                    title={tx("Editar")}
                    aria-label={tx("Editar {name}", { name: shownName(s.name) })}
                    disabled={busy}
                    onClick={() => navigate(`/staff/${s.id}/edit`)}
                  >
                    <span className="pencil" aria-hidden="true">✏️</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function sortByName(list: Staff[]): Staff[] {
  return list.slice().sort(compareByName);
}
