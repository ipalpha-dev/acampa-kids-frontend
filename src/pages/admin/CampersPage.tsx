import { useConfirm } from "../../components/ConfirmDialog";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ICONS, kidFaceSrc } from "../../icons";
import { addCamper, ageOf, deleteCamper, registerCamper, updateCamper, type Camper, type HealthInfo } from "../../api/campers";
import { fetchCampersPage, fetchHealthCounts, HEALTH_DETAIL_MAX, type CamperListItem, type HealthCounts } from "../../api/people";
import { useRoute } from "../../router";
import { useCollection, useCollectionOrEmpty } from "../../store";
import { rememberPeople } from "../../store/people";
import { useCategories, useLabelOf } from "../../store/derive";
import HealthAlerts, { useHealthLabelOf } from "../../components/HealthAlerts";
import HealthHeart from "../../components/HealthHeart";
import HealthTagFilter from "../../components/HealthTagFilter";
import GuardianWhatsApp from "../../components/GuardianWhatsApp";
import { downloadCampersXlsx, downloadMedicalCampersXlsx } from "../../export";
import PrintLabelsDialog from "../../components/PrintLabelsDialog";
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
import { ROOM_ROLE_META, staffSex } from "../../api/staff";
import { takePendingToast } from "../../pendingToast";
import { usePagedList } from "../../hooks/usePagedList";

import Breadcrumbs from "../../components/Breadcrumbs";
import CamperForm, { type CamperFormAction } from "./CamperForm";
import DetailStack from "./DetailStack";
import GiveawayPage from "../GiveawayPage";
import CamperImportPage from "./CamperImportPage";
import ImportYearPage from "./ImportYearPage";
import { DownloadGlyph } from "../../components/Glyph";
import SearchField from "../../components/SearchField";
import { setPendingImportFile, useWindowFileDrop } from "../../hooks/useFileDrop";
import { collatorLocale, useI18n } from "../../i18n";
import styles from "../../components/campers.module.scss";

interface CampersPageProps {
  token: string;
  camp: CampSummary;
  /** every camp this session may switch into — empty when it can't switch years */
  camps: CampSummary[];
  /** care team: see everything, filter and open kids, but no create / edit / delete / print — the health block is still editable on the kid's page */
  readOnly?: boolean;
  /** a history session (archived year): nobody edits anything, not even health — unlike `readOnly`, the admin's own filters/UI stay (never the care-team view) */
  locked?: boolean;
}

/** URL → what to show:  /campers · /campers/new · /campers/import · /campers/import-year · /campers/giveaway · /campers/:id · /campers/:id/edit */
type Mode = { kind: "view" } | { kind: "create" } | { kind: "import" } | { kind: "import-year" } | { kind: "giveaway" } | { kind: "edit"; id: string } | { kind: "detail"; id: string };
function modeOf(segments: string[]): Mode {
  const [, id, action] = segments;
  if (!id) return { kind: "view" };
  if (id === "new") return { kind: "create" };
  if (id === "import") return { kind: "import" };
  if (id === "import-year") return { kind: "import-year" };
  if (id === "giveaway") return { kind: "giveaway" };
  if (action === "edit") return { kind: "edit", id };
  return { kind: "detail", id };
}

type Wing = "all" | "girls" | "boys";

/** roles the server answers health to in lists (♥, tag filter, name filter ≤ 6) — decision 31 */
const HEALTH_ROLES = new Set(["coordenacao", "organizacao", "saude", "checkin"]);
/** the care team's at-a-glance numbers (count endpoint — anonymized) */
const SUMMARY_TAGS = ["medications", "foodRestrictions"] as const;
const NAME_HEALTH_DEBOUNCE_MS = 400;

/** Admin: the campers (kids) — one continuous list, detail view and create/edit form; read-only for the care team. */
export default function CampersPage({ token, camp, camps, readOnly = false, locked = false }: CampersPageProps) {
  const { tx, te } = useI18n();
  const otherCamps = useMemo(() => camps.filter((c) => c.id !== camp.id), [camps, camp.id]);
  const [importSheetOpen, setImportSheetOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(() => takePendingToast());
  // camp ops from the local store (live WebSocket feed), joined with the live names
  const campers = useCollection("campers");
  const categories = useCategories("camper");
  const bedrooms = useCollectionOrEmpty("bedrooms");
  const labelOf = useLabelOf();
  const healthLabelOf = useHealthLabelOf(token);
  const user = loadAuth()?.user;
  const activeRole = user?.activeRole ?? "";
  const audience = user?.audience ?? "staff";
  const mayHealth = HEALTH_ROLES.has(activeRole);
  const { segments, navigate } = useRoute();
  const rawMode = modeOf(segments);
  // read-only viewers can't reach the forms even by URL
  const mode: Mode = (readOnly || locked) && (rawMode.kind === "create" || rawMode.kind === "edit" || rawMode.kind === "import" || rawMode.kind === "import-year" || rawMode.kind === "giveaway") ? { kind: "view" } : rawMode;
  const confirm = useConfirm();
  // set by the open form; asks save/discard before a breadcrumb navigation leaves the form
  const leaveGuardRef = useRef<(() => Promise<boolean>) | null>(null);
  async function guardedNav(to: string) {
    const guard = leaveGuardRef.current;
    if (guard && !(await guard())) return;
    navigate(to);
  }
  const [wing, setWing] = useState<Wing>("all");
  /** team ids to show — empty = every team (the care team never filters by team / wing) */
  const [teamFilter, setTeamFilter] = useState<Set<string>>(new Set());
  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  /** the health tag picked (`allergies:<id>`, `medications`…) — the server answers that list WITH details */
  const [tag, setTag] = useState<string | null>(null);
  /** During a large import, missing allocations are expected; show warnings only when the counter is pressed. */
  const [showImportAttention, setShowImportAttention] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [printOpen, setPrintOpen] = useState(false);
  const [exporting, setExporting] = useState<{ done: number; total: number } | null>(null);

  const roomById = useMemo(() => new Map(bedrooms.map((b) => [b.id, b])), [bedrooms]);
  const teams = useCollectionOrEmpty("teams");
  const staff = useCollectionOrEmpty("staff");
  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);

  // ── health-tag filter: the server's filtered list, paged in the background, carries the details ──
  const tagged = usePagedList<CamperListItem>(tag && mayHealth ? `tag:${tag}` : null, (cursor) => fetchCampersPage(token, { cursor, tag: tag! }));

  // ── the care team's summary chips (anonymized counts) ──
  const [summary, setSummary] = useState<HealthCounts | null>(null);
  useEffect(() => {
    if (!readOnly || !mayHealth) return;
    let alive = true;
    fetchHealthCounts(token, [...SUMMARY_TAGS])
      .then((c) => alive && setSummary(c))
      .catch(() => alive && setSummary(null));
    return () => {
      alive = false;
    };
  }, [token, readOnly, mayHealth, campers?.length]);

  async function withBusy<T>(fn: () => Promise<T>): Promise<T> {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(action: CamperFormAction) {
    if (action.kind === "add") {
      const added = await withBusy(() => addCamper(token, action.personId, action.ops));
      navigate(`/campers/${added.id}`, { replace: true });
    } else if (action.kind === "register") {
      const res = await withBusy(() => registerCamper(token, action.input));
      rememberPeople([{ personId: res.camper.id, name: res.camper.name }]);
      navigate(`/campers/${res.camper.id}`, { replace: true });
    } else if (mode.kind === "edit") {
      const updated = await withBusy(() => updateCamper(token, mode.id, action.patch));
      navigate(`/campers/${updated.id}`, { replace: true });
    }
  }

  async function handleDelete(k: Camper) {
    const first = k.name.split(" ")[0] || tx("esta criança");
    if (!(await confirm({ emoji: "🏕️", title: tx("Tirar {name} do acampamento?", { name: first }), message: tx("A criança deixa de aparecer neste acampamento. O cadastro dela e da família no IPAlpha continua."), confirmLabel: tx("Tirar do acampamento"), danger: true }))) return;
    try {
      await withBusy(() => deleteCamper(token, k.id));
      navigate("/campers", { replace: true });
      setToast(tx("{name} não está mais neste acampamento.", { name: first }));
    } catch (e) {
      setError(te(e, "Algo deu errado."));
    }
  }

  /** Excel: everything is read live from IPAlpha right now (only what this role may see) — progress while it reads. */
  async function handleExport(kind: "campers" | "medical") {
    if (!campers || exporting) return;
    setError(null);
    setExporting({ done: 0, total: campers.length });
    const ctx = {
      token,
      healthAllowed: audience === "admin" || activeRole === "saude",
      contactsAllowed: audience === "admin",
      onProgress: (done: number, total: number) => setExporting({ done, total }),
    };
    try {
      if (kind === "medical") await downloadMedicalCampersXlsx(ctx, campers, bedrooms, labelOf, staff);
      else await downloadCampersXlsx(ctx, campers, bedrooms, labelOf, staff);
    } catch (e) {
      setError(te(e, "Não foi possível preparar a planilha agora."));
    } finally {
      setExporting(null);
    }
  }

  const orphanCount = useMemo(() => (campers ?? []).filter((k) => !k.caretakerId).length, [campers]);
  const noRoomCount = useMemo(() => (campers ?? []).filter((k) => !k.bedroom).length, [campers]);
  const missingAllocationCount = useMemo(() => (campers ?? []).filter((k) => !k.caretakerId || !k.bedroom).length, [campers]);
  const importingMode = !!campers?.length && missingAllocationCount / campers.length > 0.1;
  const attentionEnabled = !importingMode || showImportAttention;
  useEffect(() => {
    if (!importingMode) setShowImportAttention(false);
  }, [importingMode]);

  /** the list this screen filters: the store's kids, or — with a health tag — the server's tagged kids (kept live from the store) */
  const source = useMemo((): { list: Camper[]; health: Map<string, HealthInfo> } => {
    const health = new Map<string, HealthInfo>();
    if (!tag || !mayHealth) return { list: campers ?? [], health };
    const byId = new Map((campers ?? []).map((k) => [k.id, k]));
    const list = tagged.items.map((it) => {
      if (it.health) health.set(it.id, it.health);
      const rec = byId.get(it.id);
      return rec ? { ...rec, name: rec.name || it.name, hasHealth: it.hasHealth ?? rec.hasHealth } : (it as Camper);
    });
    return { list, health };
  }, [tag, mayHealth, campers, tagged.items]);

  const visible = useMemo(() => {
    const q = normalize(search);
    const attentionFirst = (a: Camper, b: Camper) => Number(!!a.caretakerId && !!a.bedroom) - Number(!!b.caretakerId && !!b.bedroom);
    return sortByName(source.list)
      .sort(attentionFirst)
      .filter((k) => {
        const room = k.bedroom ? roomById.get(k.bedroom) : null;
        if (wing !== "all" && room?.group !== wing) return false;
        if (teamFilter.size > 0 && !(k.team && teamFilter.has(k.team))) return false;
        if (!q) return true;
        const hay = normalize([k.name, k.nickname, labelOf(k.team), room?.name, labelOf(k.transportation), staffById.get(k.caretakerId ?? "")?.name].filter(Boolean).join(" "));
        return hay.includes(q);
      });
  }, [source.list, wing, teamFilter, search, labelOf, roomById, staffById]);

  // ── a NAME filter down to ≤ 6 kids: ask the server for those kids' health (decision 31) ──
  const [nameHealth, setNameHealth] = useState<{ q: string; health: Map<string, HealthInfo> } | null>(null);
  const nameQuery = search.trim();
  const wantNameHealth = mayHealth && !tag && nameQuery.length >= 2 && visible.length > 0 && visible.length <= HEALTH_DETAIL_MAX;
  useEffect(() => {
    if (!wantNameHealth) {
      setNameHealth(null);
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      fetchCampersPage(token, { q: nameQuery, limit: HEALTH_DETAIL_MAX })
        .then((page) => {
          if (!alive) return;
          const health = new Map<string, HealthInfo>();
          for (const it of page.items) if (it.health) health.set(it.id, it.health);
          setNameHealth({ q: nameQuery, health });
        })
        .catch(() => alive && setNameHealth(null));
    }, NAME_HEALTH_DEBOUNCE_MS);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [wantNameHealth, nameQuery, token]);
  const detailOf = (id: string): HealthInfo | undefined => source.health.get(id) ?? (nameHealth && nameHealth.q === nameQuery ? nameHealth.health.get(id) : undefined);

  /** kids per team (for the chips in the team dialog) */
  const teamCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const k of campers ?? []) if (k.team) m.set(k.team, (m.get(k.team) ?? 0) + 1);
    return m;
  }, [campers]);
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const teamChipLabel = teamFilter.size === 0 ? tx("Todos os times") : [...teamFilter].map((id) => teamById.get(id)?.name).filter(Boolean).join(", ");
  const canDropImport = !readOnly && !locked && mode.kind === "view" && !!campers && campers.length === 0;
  const emptyDropOver = useWindowFileDrop((file) => {
    setPendingImportFile(file);
    navigate("/campers/import");
  }, canDropImport);

  const counts = useMemo(() => {
    const c = { all: campers?.length ?? 0, girls: 0, boys: 0 };
    for (const k of campers ?? []) {
      const g = k.bedroom ? roomById.get(k.bedroom)?.group : null;
      if (g === "girls") c.girls++;
      else if (g === "boys") c.boys++;
    }
    return c;
  }, [campers, roomById]);

  // ── render ─────────────────────────────────────────────────────────────

  if (!campers) {
    return (
      <div className="admin-page admin-page--campers">
        {error ? <p className="message message--error">{error}</p> : <p className="opt-empty">{tx("Sincronizando com o servidor… 🏕️")}</p>}
      </div>
    );
  }

  if (mode.kind === "giveaway") {
    return <GiveawayPage who="campers" crumbs={[{ label: tx("Acampantes"), onClick: () => navigate("/campers") }, { label: tx("Sorteio") }]} />;
  }

  if (mode.kind === "import") return <CamperImportPage token={token} />;

  if (mode.kind === "import-year") {
    return <ImportYearPage kind="campers" token={token} otherCamps={otherCamps} onBack={() => navigate("/campers")} onDone={() => navigate("/campers", { replace: true })} />;
  }

  if (mode.kind === "detail") {
    return (
      <DetailStack
        token={token}
        current={{ kind: "camper", id: mode.id }}
        rootCrumbs={[{ label: tx("Acampantes"), onClick: () => navigate("/campers") }]}
        onEditCamper={readOnly || locked ? undefined : (camper) => navigate(`/campers/${camper.id}/edit`)}
        // read-only here = the care team: they still edit the kids' HEALTH block in place — never during a locked history session
        canEditHealth={readOnly && !locked}
      />
    );
  }

  const editing = mode.kind === "edit" ? campers.find((k) => k.id === mode.id) : undefined;
  const exportPct = exporting && exporting.total > 0 ? Math.round((exporting.done / exporting.total) * 100) : 0;
  const listTotal = tag && mayHealth ? (tagged.total ?? tagged.items.length) : campers.length;

  return (
    <div className="admin-page admin-page--campers">
      {mode.kind === "create" && <Breadcrumbs items={[{ label: tx("Acampantes"), onClick: () => guardedNav("/campers") }, { label: tx("Novo") }]} />}
      {mode.kind === "edit" && editing && (
        <Breadcrumbs items={[{ label: tx("Acampantes"), onClick: () => guardedNav("/campers") }, { label: editing.name.split(" ")[0] || "…", onClick: () => guardedNav(`/campers/${editing.id}`) }, { label: tx("Editar") }]} />
      )}
      <header className="admin-head">
        <h1 className="admin-title">
          {mode.kind === "create" ? (
            <>
              <img className="admin-title__icon" src={ICONS.camper} alt="" aria-hidden="true" /> {tx("Novo acampante")}
            </>
          ) : mode.kind === "edit" ? (
            tx("✏️ Editar acampante")
          ) : (
            tx("Acampantes")
          )}
        </h1>
        {mode.kind === "view" && !readOnly && !locked && (
          <div className="admin-head__actions admin-head__actions--icons">
            <button type="button" className="button button--secondary admin-head__new" title={tx("Sorteio")} aria-label={tx("Sorteio")} onClick={() => navigate("/campers/giveaway")}>
              <img className="admin-head__action-icon" src={ICONS.giveaway} alt="" aria-hidden="true" />
              <span className="admin-head__action-label">{tx("Sorteio")}</span>
            </button>
            <button
              type="button"
              className="button button--secondary admin-head__new"
              title={tx("Importar acampantes")}
              aria-label={tx("Importar acampantes")}
              onClick={() => (otherCamps.length > 0 ? setImportSheetOpen(true) : navigate("/campers/import"))}
            >
              <img className="admin-head__action-icon" src={ICONS.importCampers} alt="" aria-hidden="true" />
              <span className="admin-head__action-label">{tx("Importar")}</span>
            </button>
            <button
              type="button"
              className="button button--secondary admin-head__new"
              disabled={busy || !!exporting || campers.length === 0}
              aria-busy={!!exporting}
              title={tx("Baixar todos os acampantes em Excel")}
              aria-label={tx("Baixar todos os acampantes em Excel")}
              onClick={() => void handleExport("campers")}
            >
              <DownloadGlyph />
              <span className="admin-head__action-label">{exporting ? tx("Preparando…") : tx("Download")}</span>
            </button>
            <button type="button" className="button button--secondary admin-head__new admin-head__print" disabled={busy || campers.length === 0} title={tx("Imprimir crachás ou pulseiras")} onClick={() => setPrintOpen(true)}>
              🖨️ <span className="admin-head__action-label">{tx("Imprimir")}</span>
            </button>
            <button type="button" className="button button--primary admin-head__new" disabled={busy} title={tx("Novo acampante")} aria-label={tx("Novo acampante")} onClick={() => navigate("/campers/new")}>
              <span className="admin-head__action-plus" aria-hidden="true">+</span>
              <span className="admin-head__action-label">{tx("Novo")}</span>
            </button>
          </div>
        )}
        {/* care team: the health sheet of every camper (no documents / bus roll calls) */}
        {mode.kind === "view" && readOnly && (
          <div className="admin-head__actions admin-head__actions--icons">
            <button
              type="button"
              className="button button--secondary admin-head__new"
              disabled={!!exporting || campers.length === 0}
              aria-busy={!!exporting}
              title={tx("Baixar a planilha de saúde de todos os acampantes")}
              aria-label={tx("Baixar a planilha de saúde de todos os acampantes")}
              onClick={() => void handleExport("medical")}
            >
              <DownloadGlyph />
              <span className="admin-head__action-label">{exporting ? tx("Preparando…") : tx("Download")}</span>
            </button>
          </div>
        )}
        {mode.kind === "edit" && editing && (
          <button
            type="button"
            className="icon-btn icon-btn--lg icon-btn--danger"
            title={tx("Tirar {name} do acampamento", { name: editing.name.split(" ")[0] || tx("esta criança") })}
            aria-label={tx("Tirar {name} do acampamento", { name: editing.name.split(" ")[0] || tx("esta criança") })}
            disabled={busy}
            onClick={() => handleDelete(editing)}
          >
            🗑️
          </button>
        )}
      </header>

      {exporting && (
        <div className={styles.exportProgress} role="status" aria-live="polite">
          <span>
            {exporting.done > 0 ? tx("Preparando a planilha… {done} de {total}", { done: exporting.done, total: exporting.total }) : tx("Preparando a planilha com os dados de agora…")}
          </span>
          <span className={styles.exportBar} aria-hidden="true">
            {/* the width follows the live progress (runtime value) */}
            <span className={styles.exportBarFill} style={{ "--progress": `${exportPct}%` } as CSSProperties} />
          </span>
        </div>
      )}
      {error && <p className="message message--error">{error}</p>}

      {mode.kind === "view" && !readOnly && !locked && <PrintLabelsDialog open={printOpen} onClose={() => setPrintOpen(false)} campers={visible} allCampers={sortByName(campers)} bedrooms={bedrooms} labelOf={labelOf} />}
      {mode.kind === "view" && !readOnly && !locked && (
        <ImportSourceDialog
          open={importSheetOpen}
          onClose={() => setImportSheetOpen(false)}
          sheetIcon={ICONS.importCampers}
          onPickSheet={() => {
            setImportSheetOpen(false);
            navigate("/campers/import");
          }}
          onPickYear={() => {
            setImportSheetOpen(false);
            navigate("/campers/import-year");
          }}
        />
      )}
      <Toast message={toast} onClose={() => setToast(null)} />

      {mode.kind === "create" && <CamperForm token={token} categories={categories} busy={busy} onSubmit={handleSubmit} leaveGuardRef={leaveGuardRef} />}
      {mode.kind === "edit" && !editing && <p className="opt-empty">{tx("Acampante não encontrado.")}</p>}
      {mode.kind === "edit" && editing && <CamperForm key={editing.id} token={token} camper={editing} categories={categories} busy={busy} onSubmit={handleSubmit} leaveGuardRef={leaveGuardRef} />}

      {mode.kind === "view" && (
        <>
          {/* decision 78: import values a manual edit kept aside — the organização chooses which one stays */}
          {!readOnly && !locked && <ImportConflictsCard token={token} subject="camper" />}
          <div className="staff-toolbar">
            <SearchField placeholder={tx("Buscar por nome, líder, time, quarto…")} value={search} onChange={setSearch} aria-label={tx("Buscar")} />
          </div>
          {/* wing + team chips, in the same row as the health chips; the care team gets health only */}
          {!readOnly && (
            <div className="health-filter" role="group" aria-label={tx("Ala e time")}>
              {(
                [
                  ["all", tx("Todos")],
                  ["girls", tx("Meninas")],
                  ["boys", tx("Meninos")],
                ] as [Wing, string][]
              ).map(([key, label]) => (
                <button key={key} type="button" className={`chip-toggle chip-toggle--small ${wing === key ? "chip-toggle--on" : ""}`} aria-pressed={wing === key} onClick={() => setWing(key)}>
                  {key !== "all" && <GroupIcon group={key} face />}
                  {label}
                  <span className="cat-tab__count">{counts[key]}</span>
                </button>
              ))}
              {teams.length > 0 && (
                <button type="button" className={`chip-toggle chip-toggle--small ${teamFilter.size > 0 ? "chip-toggle--on" : ""}`} aria-pressed={teamFilter.size > 0} title={tx("Filtrar por time")} onClick={() => setTeamDialogOpen(true)}>
                  🚩 {teamChipLabel}
                  {teamFilter.size > 0 && <span className="cat-tab__count">{visible.length}</span>}
                </button>
              )}
            </div>
          )}
          {/* care team: the big picture at a glance (anonymized counts; tap = filter) */}
          {readOnly && mayHealth && (
            <div className="stat-grid" role="group" aria-label={tx("Resumo de saúde")}>
              {(
                [
                  [null, <img src={kidFaceSrc()} alt="" />, tx("Crianças"), campers.length],
                  ["medications", "💊", tx("Tomam medicação"), summary?.byTag.medications],
                  ["foodRestrictions", "🍽️", tx("Restrição alimentar"), summary?.byTag.foodRestrictions],
                ] as [string | null, ReactNode, string, number | undefined][]
              ).map(([key, emoji, label, n]) => {
                const on = key ? tag === key : tag === null;
                return (
                  <button key={label} type="button" className={`stat-card ${on ? "stat-card--on" : ""}`} aria-pressed={on} onClick={() => setTag(key && tag !== key ? key : null)}>
                    <span className="stat-card__emoji" aria-hidden="true">
                      {emoji}
                    </span>
                    <span className="stat-card__n">{n ?? "…"}</span>
                    <span className="stat-card__label">{label}</span>
                  </button>
                );
              })}
            </div>
          )}
          {mayHealth && <HealthTagFilter token={token} value={tag} onChange={setTag} />}
          <TeamFilterDialog open={teamDialogOpen} teams={teams} value={teamFilter} counts={teamCounts} onChange={setTeamFilter} onClose={() => setTeamDialogOpen(false)} />

          {campers.length === 0 && (
            <div className={`admin-empty${canDropImport ? " admin-empty--drop" : ""}${canDropImport && emptyDropOver ? " admin-empty--over" : ""}`}>
              <img className="admin-empty__icon" src={ICONS.camper} alt="" aria-hidden="true" />
              <p>{readOnly || locked ? tx("Nenhum acampante ainda.") : tx("Nenhum acampante ainda. Cadastre a primeira criança!")}</p>
              {!readOnly && !locked && (
                <button type="button" className="button button--primary" onClick={() => navigate("/campers/new")}>
                  + {tx("Adicionar")}
                </button>
              )}
            </div>
          )}
          {tag && tagged.error && <p className="message message--error">{tx("Não foi possível aplicar este filtro agora.")}</p>}
          {campers.length > 0 && visible.length === 0 && (!tag || tagged.done) && <p className="opt-empty">{tx("Nenhum resultado. 🔍")}</p>}

          <p className="admin-intro">
            {visible.length === listTotal && !tag ? tx("{n} crianças", { n: campers.length }) : tx("{visible} de {total} crianças", { visible: visible.length, total: campers.length })}
            {tag && tagged.loading && <span className="cat-hint"> · {tx("Carregando…")}</span>}
            {orphanCount > 0 &&
              (importingMode ? (
                <>
                  {" · "}
                  <button type="button" className={`orphan-tag orphan-tag--btn ${showImportAttention ? "orphan-tag--on" : ""}`} aria-pressed={showImportAttention} title={showImportAttention ? tx("Ocultar alertas de alocação") : tx("Mostrar alertas de alocação")} onClick={() => setShowImportAttention((v) => !v)}>
                    ⚠️ {tx("{n} sem líder", { n: orphanCount })}
                  </button>
                </>
              ) : (
                <span className="orphan-tag"> · ⚠️ {tx("{n} sem líder", { n: orphanCount })}</span>
              ))}
            {noRoomCount > 0 &&
              (importingMode ? (
                <>
                  {" · "}
                  <button type="button" className={`orphan-tag orphan-tag--btn ${showImportAttention ? "orphan-tag--on" : ""}`} aria-pressed={showImportAttention} title={showImportAttention ? tx("Ocultar alertas de alocação") : tx("Mostrar alertas de alocação")} onClick={() => setShowImportAttention((v) => !v)}>
                    ⚠️ {tx("{n} sem quarto", { n: noRoomCount })}
                  </button>
                </>
              ) : (
                <span className="orphan-tag"> · ⚠️ {tx("{n} sem quarto", { n: noRoomCount })}</span>
              ))}
          </p>

          <ul className="staff-list">
            {visible.map((k) => {
              const room = k.bedroom ? roomById.get(k.bedroom) : null;
              const age = ageOf(k.birthDate ?? null);
              const caretaker = k.caretakerId ? staffById.get(k.caretakerId) : undefined;
              const orphan = !k.caretakerId;
              const noRoom = !k.bedroom;
              const showAttention = attentionEnabled && (orphan || noRoom);
              const detail = detailOf(k.id);
              const shownName = k.name || tx("Carregando nome…");

              return (
                // `staff-card--cover`: every blank spot of the row opens the kid — only the family button keeps its own action
                <li key={k.id} className={`staff-card staff-card--clickable staff-card--cover ${showAttention ? "staff-card--orphan" : ""}`}>
                  <div
                    className="staff-card__body"
                    role="link"
                    tabIndex={0}
                    title={tx("Ver {name}", { name: shownName })}
                    onClick={() => navigate(`/campers/${k.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate(`/campers/${k.id}`);
                      }
                    }}
                  >
                    <h3 className="staff-card__name">
                      <span className={k.name ? undefined : styles.pendingName}>{shownName}</span>
                      {!detail && <HealthHeart show={k.hasHealth} />}
                      {age !== null && <span className="kid-card__age">{tx("{age} anos", { age })}</span>}
                    </h3>
                    {showAttention && (
                      <p className="staff-card__meta orphan-msg">
                        ⚠️ {orphan && noRoom ? tx("Esta criança está sem líder e sem quarto.") : orphan ? tx("Esta criança está sem líder.") : tx("Esta criança está sem quarto.")}
                      </p>
                    )}
                    {(room || k.team || caretaker || k.transportation) && (
                      <div className="staff-card__tags">
                        {room && <BedroomTag bedroom={room} />}
                        {caretaker && (
                          <span className="staff-tag" title={ROOM_ROLE_META.caretaker.label}>
                            <RoomRoleIcon role="caretaker" sex={staffSex(caretaker, bedrooms)} /> {caretaker.name.split(" ")[0] || "…"}
                          </span>
                        )}
                        <TeamTag teamId={k.team} />
                        <TransportTag transportId={k.transportation} short className="staff-tag--pill" />
                      </div>
                    )}
                    {detail && (
                      <div className={styles.healthReveal}>
                        <div>
                          <HealthAlerts person={detail} labelOf={healthLabelOf} />
                        </div>
                      </div>
                    )}
                  </div>
                  {audience === "admin" && !locked && (
                    <span className="staff-card__wa">
                      <GuardianWhatsApp camper={k} className="wa-btn--sm" />
                    </span>
                  )}
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
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** by name; kids whose name is still on its way go last (never a blank row on top) */
function sortByName(list: Camper[]): Camper[] {
  return list.slice().sort((a, b) => (!a.name !== !b.name ? (a.name ? -1 : 1) : a.name.localeCompare(b.name, collatorLocale(), { sensitivity: "base" })));
}
