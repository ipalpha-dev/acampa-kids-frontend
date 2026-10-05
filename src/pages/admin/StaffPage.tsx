import { useConfirm } from "../../components/ConfirmDialog";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GROUP_META, bedroomLabel } from "../../api/bedrooms";
import {
  ROOM_ROLE_META,
  createStaff,
  deleteStaff,
  staffSex,
  updateStaff,
  type Staff,
  type StaffInput,
} from "../../api/staff";
import { useCollection, useCollectionOrEmpty } from "../../store";
import { useCategories, useLabelOf } from "../../store/derive";
import { formatBrazilPhoneClient } from "../../phoneFormat";
import DetailStack from "./DetailStack";
import { useRoute } from "../../router";
import HealthAlerts from "../../components/HealthAlerts";
import HealthFilter, { matchesHealth, hasHealth, type HealthKey } from "../../components/HealthFilter";
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
import TeamFilterDialog from "../../components/TeamFilterDialog";
import RoomRoleIcon from "../../components/RoomRoleIcon";
import TeamTag from "../../components/TeamTag";
import TransportTag from "../../components/TransportTag";
import Toast from "../../components/Toast";
import WhatsAppButton from "../../components/WhatsAppButton";
import { loadAuth, type CampSummary } from "../../auth/store";
import { staffGreeting, whatsappLink } from "../../whatsapp";
import StaffImportPage from "./StaffImportPage";
import { setPendingImportFile, useWindowFileDrop } from "../../hooks/useFileDrop";
import { takePendingToast } from "../../pendingToast";
import { collatorLocale, useI18n } from "../../i18n";

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
  const myName = loadAuth()?.user.name ?? "";
  const otherCamps = useMemo(() => camps.filter((c) => c.id !== camp.id), [camps, camp.id]);
  const [importSheetOpen, setImportSheetOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(() => takePendingToast());
  // everything comes from the local store (localStorage + live WebSocket feed)
  const staff = useCollection("staff");
  const categories = useCategories("staff");
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
  const [health, setHealth] = useState<Set<HealthKey>>(new Set());
  /** tap "sem quarto" in the intro to bubble those cards to the top */
  const [noRoomFirst, setNoRoomFirst] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createSex, setCreateSex] = useState<CamperSex | null>(null);
  const [createSexBusy, setCreateSexBusy] = useState(false);
  const onCreateSex = useCallback((sex: CamperSex | null, guessing: boolean) => {
    setCreateSex(sex);
    setCreateSexBusy(guessing);
  }, []);
  useEffect(() => {
    if (mode.kind !== "create") {
      setCreateSex(null);
      setCreateSexBusy(false);
    }
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

  async function handleCreate(input: StaffInput) {
    const created = await withBusy(() => createStaff(token, input));
    navigate(`/staff/${created.id}`, { replace: true });
  }

  async function handleEdit(input: StaffInput) {
    if (mode.kind !== "edit") return;
    const updated = await withBusy(() => updateStaff(token, mode.id, input));
    navigate(`/staff/${updated.id}`, { replace: true });
  }

  async function handleDelete(member: Staff) {
    if (!(await confirm({ emoji: "🗑️", title: tx("Excluir {name} da equipe?", { name: member.name }), message: member.admin ? tx("O login de admin continua. Só o cadastro na equipe é apagado.") : tx("Isso não pode ser desfeito."), confirmLabel: tx("Excluir"), danger: true }))) return;
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
      if (!matchesHealth(s, health)) return false;
      if (!q) return true;
      const hay = normalize(
        [s.name, s.phone, labelOf(s.team), bedroomOf(s.bedroom), labelOf(s.transportation)].filter(Boolean).join(" "),
      );
      return hay.includes(q);
    });
    // only bubble "sem quarto" when the intro tag is toggled on
    if (noRoomFirst) list.sort((a, b) => Number(!!a.bedroom) - Number(!!b.bedroom));
    return list;
  }, [staff, search, wing, teamFilter, health, labelOf, bedroomOf, wingOf, noRoomFirst]);
  const noRoomCount = useMemo(() => (staff ?? []).filter((s) => !s.bedroom).length, [staff]);

  const healthCounts = useMemo(() => {
    const c: Partial<Record<HealthKey, number>> = {};
    for (const key of ["healthIssues", "allergies", "drugAllergies", "medicines", "foodRestrictions"] as const) c[key] = 0;
    for (const s of staff ?? []) {
      if (wing !== "all" && wingOf(s.bedroom) !== wing) continue;
      if (teamFilter.size > 0 && !(s.team && teamFilter.has(s.team))) continue;
      for (const key of ["healthIssues", "allergies", "drugAllergies", "medicines", "foodRestrictions"] as const) if (hasHealth(s, key)) c[key]!++;
    }
    return c;
  }, [staff, wing, teamFilter, wingOf]);

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
      <DetailStack
        token={token}
        current={{ kind: "staff", id: mode.id }}
        rootCrumbs={[{ label: tx("Equipe"), onClick: () => navigate("/staff") }]}
        onEditStaff={readOnly ? undefined : (member) => navigate(`/staff/${member.id}/edit`)}
      />
    );
  }

  const editing = mode.kind === "edit" ? staff.find((s) => s.id === mode.id) : undefined;

  return (
    <div className="admin-page admin-page--staff">
      {mode.kind === "create" && <Breadcrumbs items={[{ label: tx("Equipe"), onClick: () => guardedNav("/staff") }, { label: tx("Novo") }]} />}
      {mode.kind === "edit" && editing && (
        <Breadcrumbs items={[{ label: tx("Equipe"), onClick: () => guardedNav("/staff") }, { label: editing.name.split(" ")[0], onClick: () => guardedNav(`/staff/${editing.id}`) }, { label: tx("Editar") }]} />
      )}
      <header className="admin-head">
        <h1 className="admin-title">
          {mode.kind === "create" ? (
            <>
              <img className={`admin-title__icon${createSexBusy ? " admin-title__icon--busy" : ""}`} src={createSex === "M" ? ICONS.man : ICONS.woman} alt="" aria-hidden="true" /> <span>{tx("Novo membro da equipe")}</span>
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
              disabled={busy || staff.length === 0}
              title={tx("Baixar toda a equipe em Excel")}
              aria-label={tx("Baixar toda a equipe em Excel")}
              onClick={() => downloadStaffXlsx(staff, bedrooms, labelOf)}
            >
              <DownloadGlyph />
              <span className="admin-head__action-label">{tx("Download")}</span>
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
            title={tx("Excluir {name} da equipe", { name: editing.name })}
            aria-label={tx("Excluir {name} da equipe", { name: editing.name })}
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
          categories={categories}
          busy={busy}
          onSubmit={handleCreate}
          onSexChange={onCreateSex}
          leaveGuardRef={leaveGuardRef}
        />
      )}
      {mode.kind === "edit" && !editing && <p className="opt-empty">{tx("Pessoa não encontrada.")}</p>}
      {mode.kind === "edit" && editing && (
        <>
          <StaffForm
            token={token}
            key={editing.id}
            member={editing}
            categories={categories}
            busy={busy}
            onSubmit={handleEdit}
            leaveGuardRef={leaveGuardRef}
          />
          {editing.admin && <p className="cat-hint">🔑 {tx("{name} é admin: o login continua se sair da equipe.", { name: editing.name })}</p>}
        </>
      )}

      {mode.kind === "view" && (
        <>
          <div className="staff-toolbar">
            <SearchField placeholder={tx("Buscar por nome, celular, time, quarto…")} value={search} onChange={setSearch} aria-label={tx("Buscar")} />
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
          <HealthFilter value={health} onChange={setHealth} counts={healthCounts} />
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
                <li key={s.id} className={`staff-card staff-card--clickable staff-card--cover ${noRoom ? "staff-card--orphan" : ""} ${s.active ? "" : "staff-card--inactive"} ${s.aiReviewStatus === "pending" || s.aiReviewStatus === "processing" || s.aiReviewStatus === "structured" ? "camper-ai-review" : ""}`} title={s.aiReviewStatus === "pending" || s.aiReviewStatus === "processing" || s.aiReviewStatus === "structured" ? tx("Cadastro em revisão pela IA") : undefined}>
                  <div
                    className="staff-card__body"
                    role="link"
                    tabIndex={0}
                    title={tx("Ver {name}", { name: s.name })}
                    onClick={() => navigate(`/staff/${s.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate(`/staff/${s.id}`);
                      }
                    }}
                  >
                    <h3 className="staff-card__name">
                      {s.name}
                      {s.admin && <span className="staff-card__inactive" title={tx("Admin do app")}>admin</span>}
                      {!s.active && <span className="staff-card__inactive">{tx("inativo")}</span>}
                    </h3>
                    {noRoom && <p className="staff-card__meta orphan-msg">⚠️ {tx("Esta pessoa está sem quarto.")}</p>}
                    <p className="staff-card__meta">
                      {s.phone ? formatBrazilPhoneClient(s.phone) : <em className="staff-card__missing">{tx("sem celular")}</em>}
                    </p>
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
                    <HealthAlerts person={s} labelOf={labelOf} />
                  </div>
                  {s.phone && (
                    <WhatsAppButton
                      className="wa-btn--sm staff-card__wa"
                      href={whatsappLink(s.phone, staffGreeting({ toName: s.name, fromName: myName }))}
                      label={tx("Falar com {name} no WhatsApp", { name: s.name.split(" ")[0] })}
                    />
                  )}
                  <button
                    type="button"
                    className="icon-btn icon-btn--lg staff-card__edit"
                    title={tx("Editar")}
                    aria-label={tx("Editar {name}", { name: s.name })}
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
  return list.slice().sort((a, b) => a.name.localeCompare(b.name, collatorLocale(), { sensitivity: "base" }));
}
