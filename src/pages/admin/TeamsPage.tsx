import { useMemo, useState, type FormEvent } from "react";
import { useConfirm } from "../../components/ConfirmDialog";
import Dialog from "../../components/Dialog";
import { contrastText, createTeam, deleteTeam, reorderTeams, updateTeam, type Team, type TeamInput } from "../../api/teams";
import { useCollection, useCollectionOrEmpty } from "../../store";
import PageFooter from "../../components/PageFooter";
import Breadcrumbs from "../../components/Breadcrumbs";
import { ICONS } from "../../icons";
import { useI18n } from "../../i18n";

interface TeamsPageProps {
  token: string;
  onAssign?: () => void;
  onScoreboard?: () => void;
  /** during camp, Teams is reached from the Placar tab. */
  onScoreboardBack?: () => void;
}

/**
 * Admin-only: the camp TEAMS (times) — name and colour. Kids and staff are
 * linked to a team on their forms; the scoreboard (Placar) ranks these teams.
 */
export default function TeamsPage({ token, onAssign, onScoreboard, onScoreboardBack }: TeamsPageProps) {
  const { tx, te } = useI18n();
  const teams = useCollection("teams");
  const staff = useCollectionOrEmpty("staff");
  const campers = useCollectionOrEmpty("campers");
  const scores = useCollectionOrEmpty("scores");
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Team | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const members = useMemo(() => {
    const m = new Map<string, { kids: number; staff: number }>();
    for (const k of campers) if (k.team) m.set(k.team, { kids: (m.get(k.team)?.kids ?? 0) + 1, staff: m.get(k.team)?.staff ?? 0 });
    for (const s of staff) if (s.team && s.active) m.set(s.team, { kids: m.get(s.team)?.kids ?? 0, staff: (m.get(s.team)?.staff ?? 0) + 1 });
    return m;
  }, [campers, staff]);
  const totals = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of scores) m.set(e.teamId, (m.get(e.teamId) ?? 0) + e.points);
    return m;
  }, [scores]);

  async function withBusy(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(te(err, "Algo deu errado."));
    } finally {
      setBusy(false);
    }
  }

  async function handleSave(input: TeamInput) {
    const target = editing;
    await withBusy(async () => {
      if (target === "new") await createTeam(token, input);
      else if (target) await updateTeam(token, target.id, input);
      setEditing(null);
    });
  }

  async function handleDelete(t: Team) {
    const m = members.get(t.id);
    const message = m
      ? tx("{kids} criança(s) e {staff} pessoa(s) da equipe ficam sem time e o placar do time é apagado. Não dá para desfazer.", { kids: m.kids, staff: m.staff })
      : tx("O placar do time é apagado. Não dá para desfazer.");
    if (!(await confirm({ emoji: "🗑️", title: tx("Excluir {name}?", { name: t.name }), message, confirmLabel: tx("Excluir"), danger: true }))) return;
    await withBusy(() => deleteTeam(token, t.id));
  }

  async function move(t: Team, dir: -1 | 1) {
    if (!teams) return;
    const ids = teams.map((x) => x.id);
    const i = ids.indexOf(t.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await withBusy(() => reorderTeams(token, ids));
  }

  if (!teams) {
    return (
      <div className="admin-page">
        <p className="opt-empty">{tx("Carregando times… 🚩")}</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      {onScoreboardBack && <Breadcrumbs items={[{ label: tx("Placar"), onClick: onScoreboardBack }, { label: tx("Times") }]} />}
      <header className="admin-head">
        <h1 className="admin-title"><img className="admin-title__icon" src={ICONS.team} alt="" aria-hidden="true" /> {tx("Times")}</h1>
        <div className="admin-head__actions admin-head__actions--icons">
          {onAssign && teams.length > 0 && <button type="button" className="button button--secondary admin-head__new" title={tx("Montar times")} onClick={onAssign}><img className="admin-head__action-icon" src={ICONS.teamAssign} alt="" aria-hidden="true" /><span className="admin-head__action-label">{tx("Montar times")}</span></button>}
          {onScoreboard && <button type="button" className="button button--secondary admin-head__new" onClick={onScoreboard}>🏆 <span className="admin-head__action-label">{tx("Placar")}</span></button>}
          <button type="button" className="button button--primary admin-head__new" disabled={busy} onClick={() => setEditing("new")}>
            + <span className="admin-head__action-label">{tx("Novo time")}</span>
          </button>
        </div>
      </header>
      {error && <p className="message message--error">{error}</p>}

      {teams.length === 0 ? (
        <p className="opt-empty">{tx("Nenhum time ainda. Crie o primeiro!")}</p>
      ) : (
        <ul className="team-list">
          {teams.map((t, i) => {
            const m = members.get(t.id);
            return (
              <li key={t.id} className="team-card" style={{ borderLeftColor: t.color }}>
                <span className="team-card__badge" style={{ background: t.color, color: contrastText(t.color) }} aria-hidden="true">
                  {totals.get(t.id) ?? 0}
                </span>
                <div className="team-card__body">
                  <h3 className="team-card__name">{t.name}</h3>
                  <p className="team-card__meta">
                    {m ? (
                      <>
                        {m.kids === 1 ? tx("{n} criança", { n: m.kids }) : tx("{n} crianças", { n: m.kids })} · {tx("{n} da equipe", { n: m.staff })}
                      </>
                    ) : (
                      <em className="staff-card__missing">{tx("sem ninguém ainda")}</em>
                    )}
                  </p>
                </div>
                <span className="team-card__actions">
                  <button type="button" className="icon-btn" title={tx("Subir")} aria-label={tx("Subir {name}", { name: t.name })} disabled={busy || i === 0} onClick={() => void move(t, -1)}>
                    ↑
                  </button>
                  <button type="button" className="icon-btn" title={tx("Descer")} aria-label={tx("Descer {name}", { name: t.name })} disabled={busy || i === teams.length - 1} onClick={() => void move(t, 1)}>
                    ↓
                  </button>
                  <button type="button" className="icon-btn" title={tx("Editar")} aria-label={tx("Editar {name}", { name: t.name })} disabled={busy} onClick={() => setEditing(t)}>
                    <span className="pencil" aria-hidden="true">✏️</span>
                  </button>
                  <button type="button" className="icon-btn icon-btn--danger" title={tx("Excluir")} aria-label={tx("Excluir {name}", { name: t.name })} disabled={busy} onClick={() => void handleDelete(t)}>
                    🗑️
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <PageFooter>{tx("🔒 Quem lança pontos no Placar é definido em Configurações → Jogos.")}</PageFooter>

      {editing && <TeamDialog team={editing === "new" ? undefined : editing} busy={busy} onSave={handleSave} onClose={() => setEditing(null)} />}
    </div>
  );
}

/** High-saturation colours kids can shout by name without mixing them up. */
/** `key` names the swatch class (styles.scss `$team-presets` — keep the hex values in sync). */
const PRESETS: { key: string; name: string; hex: string }[] = [
  { key: "vermelho", name: "Vermelho", hex: "#e30613" },
  { key: "laranja", name: "Laranja", hex: "#ff6600" },
  { key: "amarelo", name: "Amarelo", hex: "#ffcc00" },
  { key: "lima", name: "Lima", hex: "#a8e10c" },
  { key: "verde", name: "Verde", hex: "#00a651" },
  { key: "ciano", name: "Ciano", hex: "#00c2e0" },
  { key: "azul", name: "Azul", hex: "#0057b8" },
  { key: "roxo", name: "Roxo", hex: "#6b2d8b" },
  { key: "rosa", name: "Rosa", hex: "#ff1493" },
  { key: "marrom", name: "Marrom", hex: "#8b4513" },
  { key: "preto", name: "Preto", hex: "#1a1a1a" },
];

function TeamDialog({ team, busy, onSave, onClose }: { team?: Team; busy: boolean; onSave: (input: TeamInput) => Promise<void>; onClose: () => void }) {
  const { tx } = useI18n();
  const [name, setName] = useState(team?.name ?? "");
  const [color, setColor] = useState(team?.color ?? PRESETS[0].hex);
  const valid = name.trim().length > 0 && /^#[0-9a-f]{6}$/i.test(color);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    void onSave({ name: name.trim(), color: color.toLowerCase() });
  }

  return (
    <Dialog open onClose={onClose} title={team ? tx("Editar time") : tx("Novo time")} width={520}>
      <form className="cat-form" onSubmit={submit}>
        <h2 className="cat-form__title">{team ? tx("✏️ Editar time") : tx("🚩 Novo time")}</h2>

        <label className="cat-field">
          <span className="cat-field__label">{tx("Nome")}</span>
          <input className="cat-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={tx("Time Belém")} maxLength={60} autoFocus disabled={busy} />
        </label>

        <div className="cat-field">
          <span className="cat-field__label">{tx("Cor")}</span>
          <div className="color-picker">
            <label className="color-picker__custom" title={tx("Escolher outra cor")}>
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} disabled={busy} aria-label={tx("Cor do time")} />
              <span className="color-picker__preview" style={{ background: color, color: contrastText(color) }}>
                {name.trim() || "Aa"}
              </span>
            </label>
            <div className="color-picker__presets" role="radiogroup" aria-label={tx("Cores sugeridas")}>
              {PRESETS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  role="radio"
                  aria-checked={c.hex === color.toLowerCase()}
                  className={`color-picker__swatch color-picker__swatch--${c.key} ${c.hex === color.toLowerCase() ? "color-picker__swatch--on" : ""}`}
                  title={tx(c.name)}
                  disabled={busy}
                  onClick={() => setColor(c.hex)}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="cat-form__actions">
          <button type="button" className="button button--secondary" disabled={busy} onClick={onClose}>
            {tx("Cancelar")}
          </button>
          <button type="submit" className="button button--primary" disabled={busy || !valid}>
            {team ? tx("Salvar") : tx("Criar time")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
