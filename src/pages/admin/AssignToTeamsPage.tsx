import { useMemo, useState, type ReactNode } from "react";
import Breadcrumbs from "../../components/Breadcrumbs";
import DesktopBoardNotice from "../../components/DesktopBoardNotice";
import Dialog from "../../components/Dialog";
import OptionCards from "../../components/OptionCards";
import PreferenceGroupCard from "../../components/PreferenceGroupCard";
import PreferenceStrategyControl, { usePreferenceStrategy } from "../../components/PreferenceStrategyControl";
import { PreferenceTipPortal, usePreferenceTip } from "../../components/PreferenceTip";
import { AssignmentCamperChip, AssignmentStaffChip } from "../../components/AssignmentChips";
import { assignPeopleToTeam, autoAssignCamperTeams, type TeamPersonKind } from "../../api/teams";
import type { Camper } from "../../api/campers";
import type { Staff } from "../../api/staff";
import { blobLimitHint, buildPreferenceUnits, matchAllPreferences, normName, preferenceUnitsIn, type KidUnit, type PreferenceMap } from "../../roomGroups";
import { useCollection, useCollectionOrEmpty } from "../../store";
import { ICONS } from "../../icons";
import { GROUP_META, type Bedroom } from "../../api/bedrooms";
import SearchField from "../../components/SearchField";
import { useI18n } from "../../i18n";
import { compareByName } from "./staffNames";

interface Props { token: string; onBack: () => void; onScoreboard?: () => void }
type GroupMode = "leader" | "preference" | "ungrouped";
type Audience = "all" | "campers" | "staff";
type AutoMode = "random" | "leader" | "preference";
interface DragUnit { kind: TeamPersonKind; ids: string[]; from: string | null }
interface CamperGroup { key: string; label: string; people: Camper[] }
interface BoardContext { prefs: PreferenceMap; preferenceUnits: KidUnit[]; bedrooms: Bedroom[]; campers: Camper[]; groupMode: GroupMode; tip: ReturnType<typeof usePreferenceTip> }

/** Immediate team board: every drop writes to MongoDB and the WebSocket updates all clients. */
export default function AssignToTeamsPage({ token, onBack, onScoreboard }: Props) {
  const { tx, te } = useI18n();
  const teams = useCollection("teams");
  const campers = useCollectionOrEmpty("campers");
  const bedrooms = useCollectionOrEmpty("bedrooms");
  const staff = useCollectionOrEmpty("staff").filter((member) => member.active);
  const [groupMode, setGroupMode] = useState<GroupMode>("leader");
  const [audience, setAudience] = useState<Audience>("all");
  const [autoOpen, setAutoOpen] = useState(false);
  const [dragging, setDragging] = useState<DragUnit | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [busyIds, setBusyIds] = useState<Set<string>>(() => new Set());
  const [autoBusy, setAutoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const q = normName(search);
  const staffById = useMemo(() => new Map(staff.map((member) => [member.id, member])), [staff]);
  // same clusters as Montar quartos: preferences resolve against the whole roster, never one zone
  const prefs = useMemo(() => matchAllPreferences(campers), [campers]);
  /** Smart | Strict | Loose + the Smart limit (this device, shared with Montar quartos) */
  const [grouping, setGrouping] = usePreferenceStrategy("teams");
  const preferenceUnits = useMemo(() => buildPreferenceUnits(campers, prefs, {}, bedrooms, grouping), [campers, prefs, bedrooms, grouping]);
  const tip = usePreferenceTip(prefs);
  const context: BoardContext = { prefs, preferenceUnits, bedrooms, campers, groupMode, tip };
  const showCampers = audience !== "staff";
  const showStaff = audience !== "campers";
  const peopleByTeam = (teamId: string | null) => ({
    campers: campers.filter((camper) => camper.team === teamId && (!q || normName(camper.name).includes(q))),
    staff: staff.filter((member) => member.team === teamId && (!q || normName(member.name).includes(q))).sort(compareByName),
  });

  async function move(unit: DragUnit, teamId: string | null) {
    const ids = unit.ids.filter((id) => !busyIds.has(id));
    if (unit.from === teamId || ids.length === 0) return;
    setBusyIds((current) => new Set([...current, ...ids]));
    setError(null);
    try {
      await assignPeopleToTeam(token, unit.kind, ids, teamId);
    } catch (err) {
      setError(te(err, "Não foi possível mudar o time."));
    } finally {
      setBusyIds((current) => { const next = new Set(current); for (const id of ids) next.delete(id); return next; });
      setDragging(null);
      setOver(null);
    }
  }
  function drop(teamId: string | null) { if (dragging) void move(dragging, teamId); }

  async function autoAssign(mode: AutoMode) {
    if (autoBusy || campers.length === 0) return;
    setAutoBusy(true);
    setError(null);
    try {
      await autoAssignCamperTeams(token, automaticGroups(campers, mode, context));
      setAutoOpen(false);
    } catch (err) {
      setError(te(err, "Não foi possível distribuir as crianças."));
    } finally {
      setAutoBusy(false);
    }
  }

  if (!teams) return <div className="admin-page"><p className="opt-empty">{tx("Sincronizando com o servidor… 🏕️")}</p></div>;
  const crumbs = onScoreboard
    ? [{ label: tx("Placar"), onClick: onScoreboard }, { label: tx("Times"), onClick: onBack }, { label: tx("Distribuir") }]
    : [{ label: tx("Times"), onClick: onBack }, { label: tx("Distribuir") }];

  return (
    <div className="admin-page">
      <DesktopBoardNotice what={tx("distribuir crianças e equipe nos times")} />
      <Breadcrumbs items={crumbs} />
      <header className="admin-head">
        <h1 className="admin-title"><img className="admin-title__icon" src={ICONS.teamAssign} alt="" aria-hidden="true" /> {tx("Montar times")}</h1>
        <button type="button" className="button button--secondary admin-head__new" disabled={autoBusy || teams.length < 2 || campers.length === 0} onClick={() => setAutoOpen(true)}><img className="admin-head__action-icon" src={ICONS.teamDistribute} alt="" aria-hidden="true" /> <span className="admin-head__action-label">{tx("Distribuir")}</span></button>
      </header>
      <p className="admin-intro">{tx("Arraste o fundo de um grupo para mover todos. Arraste uma pessoa para movê-la sozinha. Cada mudança é salva na hora.")}</p>
      {error && <p className="message message--error">{error}</p>}

      {/* same toolbar as Ônibus: who is on the board, with counts */}
      <div className="assign-toolbar" role="group" aria-label={tx("Quem mostrar")}>
        {(
          [
            { key: "all" as const, label: tx("Todos"), icon: ICONS.staffPair, count: campers.length + staff.length },
            { key: "campers" as const, label: tx("Crianças"), icon: ICONS.camper, count: campers.length },
            { key: "staff" as const, label: tx("Equipe"), icon: GROUP_META.staff.icon ?? null, count: staff.length },
          ] satisfies { key: Audience; label: string; icon: string | null; count: number }[]
        ).map((f) => (
          <button key={f.key} type="button" className={`chip-toggle chip-toggle--small ${audience === f.key ? "chip-toggle--on" : ""}`} aria-pressed={audience === f.key} onClick={() => setAudience(f.key)}>
            {f.icon && <img className="chip-toggle__icon" src={f.icon} alt="" aria-hidden="true" />}
            {f.label}
            <span className="cat-tab__count">{f.count}</span>
          </button>
        ))}
      </div>
      {/* how the kids are clustered — the same three ideas the Distribuir dialog offers */}
      {showCampers && (
        <div className="assign-toolbar" role="group" aria-label={tx("Agrupar crianças")}>
          <span className="assign-toolbar__label">{tx("Agrupar:")}</span>
          {(
            [
              { key: "leader" as const, label: tx("Por líder"), icon: ICONS.leaderFace },
              { key: "preference" as const, label: tx("Por preferência de quarto"), icon: ICONS.bunk },
              { key: "ungrouped" as const, label: tx("Sem agrupar"), icon: null },
            ] satisfies { key: GroupMode; label: string; icon: string | null }[]
          ).map((g) => (
            <button key={g.key} type="button" className={`chip-toggle chip-toggle--small ${groupMode === g.key ? "chip-toggle--on" : ""}`} aria-pressed={groupMode === g.key} onClick={() => setGroupMode(g.key)}>
              {g.icon && <img className="chip-toggle__icon" src={g.icon} alt="" aria-hidden="true" />}
              {g.label}
            </button>
          ))}
        </div>
      )}

      <div className="team-assign-board">
        <TeamZone
          id="pool" title={tx("Sem time")} color={null} count={(showCampers ? campers.filter((p) => !p.team).length : 0) + (showStaff ? staff.filter((p) => !p.team).length : 0)}
          over={over === "pool"} onOver={setOver} onDrop={() => drop(null)} search={search} onSearch={setSearch} pool
          footer={showCampers && groupMode === "preference" ? <PreferenceStrategyControl value={grouping} onChange={setGrouping} medianHint={blobLimitHint(bedrooms)} /> : null}
          groups={showCampers ? groupCampers(peopleByTeam(null).campers, groupMode, staffById, context) : []}
          staff={showStaff ? peopleByTeam(null).staff : []} from={null} busyIds={busyIds} onDrag={setDragging} context={context}
        />
        <div className="team-assign-grid">
          {teams.map((team) => {
            const people = peopleByTeam(team.id);
            return <TeamZone key={team.id} id={team.id} title={team.name} color={team.color} count={(showCampers ? people.campers.length : 0) + (showStaff ? people.staff.length : 0)} over={over === team.id} onOver={setOver} onDrop={() => drop(team.id)} groups={showCampers ? groupCampers(people.campers, groupMode, staffById, context) : []} staff={showStaff ? people.staff : []} from={team.id} busyIds={busyIds} onDrag={setDragging} context={context} />;
          })}
        </div>
      </div>
      <AutoAssignDialog open={autoOpen} busy={autoBusy} onChoose={(mode) => void autoAssign(mode)} onClose={() => setAutoOpen(false)} />
      <PreferenceTipPortal tip={tip.tip} anchor={tip.anchor} onClose={tip.close} onEnter={tip.enterTip} onLeave={tip.leaveTip} kids={campers} prefs={prefs} bedrooms={bedrooms} />
    </div>
  );
}

function TeamZone({ id, title, color, count, over, onOver, onDrop, groups, staff, from, busyIds, onDrag, pool, search, onSearch, context, footer }: { id: string; title: string; color: string | null; count: number; over: boolean; onOver: (id: string | null) => void; onDrop: () => void; groups: CamperGroup[]; staff: Staff[]; from: string | null; busyIds: Set<string>; onDrag: (unit: DragUnit | null) => void; pool?: boolean; search?: string; onSearch?: (value: string) => void; context: BoardContext; footer?: ReactNode }) {
  const { tx } = useI18n();
  const body = <>
    {groups.map((group) => <CamperGroupCard key={group.key} group={group} from={from} busyIds={busyIds} onDrag={onDrag} context={context} />)}
    {staff.map((member) => <AssignmentStaffChip key={member.id} staff={member} bedrooms={context.bedrooms} busy={busyIds.has(member.id)} draggable onDragStart={(event) => { event.stopPropagation(); onDrag({ kind: "staff", ids: [member.id], from }); }} onDragEnd={() => onDrag(null)} />)}
    {groups.length + staff.length === 0 && <p className={pool ? "opt-empty" : "team-assign-empty"}>{pool ? tx("Todo mundo está em um time.") : tx("Solte pessoas aqui")}</p>}
  </>;
  if (pool) return <section className={`team-assign-pool${over ? " is-over" : ""}`} onDragOver={(event) => { event.preventDefault(); onOver(id); }} onDragLeave={() => onOver(null)} onDrop={onDrop}><header><h2><img src={ICONS.team} alt="" aria-hidden="true" /> {title} <span className="cat-tab__count">{count}</span></h2><SearchField compact placeholder={tx("Buscar por nome…")} value={search ?? ""} onChange={(value) => onSearch?.(value)} aria-label={tx("Buscar por nome")} /></header><div className="team-assign-people">{body}</div>{footer}</section>;
  return <section className={`team-assign-team${over ? " is-over" : ""}`} style={{ borderTopColor: color ?? undefined }} onDragOver={(event) => { event.preventDefault(); onOver(id); }} onDragLeave={() => onOver(null)} onDrop={onDrop}><header><span className="team-assign-flag" style={{ background: color ?? undefined }} aria-hidden="true" /><h2>{title}</h2><span className="cat-tab__count">{count}</span></header><div className="team-assign-people">{body}</div></section>;
}

/** Same card as Montar quartos: the tinted card drags the group; a chip stops propagation and drags one camper. */
function CamperGroupCard({ group, from, busyIds, onDrag, context }: { group: CamperGroup; from: string | null; busyIds: Set<string>; onDrag: (unit: DragUnit | null) => void; context: BoardContext }) {
  const { tx } = useI18n();
  const ids = group.people.map((person) => person.id);
  const busy = ids.some((id) => busyIds.has(id));
  const { tip } = context;
  const chip = (camper: Camper, state: { grouped: boolean; missing: boolean; noPreference: boolean }) => <AssignmentCamperChip key={camper.id} camper={camper} peers={context.campers} {...state} busy={busyIds.has(camper.id)} draggable buttonRef={tip.register(camper.id)} onPointerDown={(e) => tip.gestureStart(e.pointerType)} onDragStart={(event) => { event.stopPropagation(); tip.gestureDragged(); onDrag({ kind: "camper", ids: [camper.id], from }); }} onDragEnd={() => onDrag(null)} onClick={() => { if (tip.wasTap()) tip.tap(camper.id); }} onMouseEnter={() => tip.hover(camper.id)} onMouseLeave={() => tip.leave(camper.id)} />;

  // the "✗ name" rows only make sense while grouping BY preference, and only while the kid is still waiting on the left
  const showMissing = context.groupMode === "preference" && from === null;
  if (!group.label.startsWith("Líder:")) return <PreferenceGroupCard unit={{ id: group.key, members: group.people }} prefs={context.prefs} busy={busy} draggable showMissing={showMissing} onGroupDragStart={(event) => { event.stopPropagation(); onDrag({ kind: "camper", ids, from }); }} onGroupDragEnd={() => onDrag(null)} renderCamper={chip} />;
  const leaderName = group.label.slice("Líder: ".length);
  const label = tx("Líder: {name}", { name: leaderName === "não visível" ? tx("não visível") : leaderName });
  return <div draggable={!busy} className={`preference-group preference-group--grouped preference-group--labelled${busy ? " preference-group--saving" : ""}`} onDragStart={(event) => { event.stopPropagation(); onDrag({ kind: "camper", ids, from }); }} onDragEnd={() => onDrag(null)} role="group" aria-label={label}><span className="preference-group__label">{label}</span><div className="preference-group__chips">{group.people.map((person) => chip(person, { grouped: true, missing: false, noPreference: !(context.prefs.get(person.id) ?? []).length }))}</div></div>;
}

function groupCampers(campers: Camper[], mode: GroupMode, staffById: Map<string, { name: string }>, context: BoardContext): CamperGroup[] {
  if (mode === "ungrouped") return campers.map((person) => ({ key: person.id, label: "", people: [person] }));
  if (mode === "preference") return preferenceUnitsIn(context.preferenceUnits, campers).map((unit) => ({ key: unit.id, label: "", people: unit.members }));
  const groups = new Map<string, Camper[]>();
  for (const camper of campers) { const key = camper.caretakerId ?? `single:${camper.id}`; groups.set(key, [...(groups.get(key) ?? []), camper]); }
  return [...groups].map(([key, people]) => ({ key, label: key.startsWith("single:") ? "" : `Líder: ${staffById.get(key)?.name ?? "não visível"}`, people }));
}

function automaticGroups(campers: Camper[], mode: AutoMode, context: BoardContext): string[][] {
  if (mode === "random") return campers.map((camper) => [camper.id]);
  if (mode === "preference") return context.preferenceUnits.map((unit) => unit.members.map((camper) => camper.id));
  const groups = new Map<string, string[]>();
  for (const camper of campers) { const key = camper.caretakerId ?? `single:${camper.id}`; groups.set(key, [...(groups.get(key) ?? []), camper.id]); }
  return [...groups.values()];
}

function AutoAssignDialog({ open, busy, onChoose, onClose }: { open: boolean; busy: boolean; onChoose: (mode: AutoMode) => void; onClose: () => void }) {
  const { tx } = useI18n();
  return <Dialog open={open} onClose={onClose} title={tx("Distribuir crianças")} width={560} dismissible={!busy}><div className="cat-form"><h2 className="cat-form__title">{tx("Como distribuir as crianças?")}</h2><p className="admin-intro">{tx("A distribuição usa todos os times e tenta manter as quantidades equilibradas.")}</p><OptionCards<AutoMode> label={tx("Como distribuir")} value={null} disabled={busy} onChange={onChoose} options={[
    { key: "random", icon: ICONS.giveaway, title: tx("Aleatoriamente"), subtitle: tx("Cada criança é sorteada separadamente.") },
    { key: "leader", icon: ICONS.leaderFace, title: tx("Manter grupos por líder"), subtitle: tx("Crianças do mesmo líder ficam juntas.") },
    { key: "preference", icon: ICONS.bunk, title: tx("Manter preferências de quarto"), subtitle: tx("Crianças ligadas pelas preferências ficam juntas.") },
  ]} /><div className="cat-form__actions"><button type="button" className="button button--secondary" disabled={busy} onClick={onClose}>{tx("Cancelar")}</button></div></div></Dialog>;
}
