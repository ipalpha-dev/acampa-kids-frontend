import { useEffect, useMemo, useState } from "react";
import { fetchCampSummary, importFromCamp, type CampImportBlock, type CampImportSummary, type ImportFromCampResult } from "../api/camps";
import type { CampSummary } from "../auth/store";
import OptionCards, { type OptionCard } from "../components/OptionCards";
import Toggle from "../components/Toggle";
import { ICONS } from "../icons";
import { useI18n } from "../i18n";

interface PreviousYearStepProps {
  token: string;
  camp: CampSummary;
  /** every camp this session may switch into (includes the current one) */
  camps: CampSummary[];
}

interface BlockDef {
  key: CampImportBlock;
  label: string;
  icon?: string;
  emoji?: string;
  unit: [string, string];
}

const BLOCKS: readonly BlockDef[] = [
  { key: "categories", label: "Categorias", emoji: "🗂️", unit: ["categoria", "categorias"] },
  { key: "teams", label: "Times", icon: ICONS.team, unit: ["time", "times"] },
  { key: "bedrooms", label: "Quartos", icon: ICONS.bed, unit: ["quarto", "quartos"] },
  { key: "transports", label: "Ônibus", icon: ICONS.transport, unit: ["veículo", "veículos"] },
  { key: "staff", label: "Equipe", icon: ICONS.staffPair, unit: ["pessoa", "pessoas"] },
  { key: "campers", label: "Acampantes", icon: ICONS.camper, unit: ["acampante", "acampantes"] },
  { key: "schedule", label: "Programação", icon: ICONS.schedule, unit: ["evento", "eventos"] },
  { key: "docs", label: "Documentos", emoji: "📖", unit: ["documento", "documentos"] },
  { key: "settings", label: "Configurações", emoji: "⚙️", unit: ["configuração", "configurações"] },
] as const;

const DEFAULT_ON: readonly CampImportBlock[] = ["categories"];

/** "Outros anos": pick a source year and the blocks to copy from it — the wizard step for `campImport.ts`. */
export default function PreviousYearStep({ token, camp, camps }: PreviousYearStepProps) {
  const { tx } = useI18n();
  const others = useMemo(() => camps.filter((c) => c.id !== camp.id).sort((a, b) => b.year - a.year), [camps, camp.id]);
  const [sourceId, setSourceId] = useState<string | null>(others[0]?.id ?? null);
  const [summaries, setSummaries] = useState<Record<string, CampImportSummary | null>>({});
  const [blocks, setBlocks] = useState<Set<CampImportBlock>>(() => new Set(DEFAULT_ON));
  const [withRoles, setWithRoles] = useState(true);
  const [withAssignments, setWithAssignments] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportFromCampResult | null>(null);

  useEffect(() => {
    let alive = true;
    for (const c of others) {
      fetchCampSummary(token, c.id)
        .then((s) => alive && setSummaries((m) => ({ ...m, [c.id]: s })))
        .catch(() => alive && setSummaries((m) => ({ ...m, [c.id]: null })));
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const summary = sourceId ? summaries[sourceId] : undefined;
  const counts = summary?.counts;

  const sourceOptions: OptionCard<string>[] = others.map((c) => {
    const s = summaries[c.id];
    const subtitle = s === undefined ? "…" : s === null ? tx("Não foi possível carregar.") : tx("{campers} acampantes · {staff} na equipe", { campers: s.counts.campers, staff: s.counts.staff });
    return { key: c.id, icon: ICONS.previousYear, title: c.label, subtitle };
  });

  function toggleBlock(key: CampImportBlock, on: boolean) {
    setResult(null);
    setBlocks((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  const needsPlacement = (blocks.has("campers") || blocks.has("staff")) && (!blocks.has("bedrooms") || !blocks.has("teams") || !blocks.has("transports"));

  async function doImport() {
    if (!sourceId || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await importFromCamp(token, sourceId, {
        blocks: [...blocks],
        withRoles: blocks.has("schedule") ? withRoles : undefined,
        withAssignments: blocks.has("schedule") && blocks.has("staff") ? withAssignments : undefined,
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : tx("Algo deu errado."));
    } finally {
      setBusy(false);
    }
  }

  if (others.length === 0) return null;

  const sourceYear = others.find((c) => c.id === sourceId)?.year ?? "";
  const summaryLine = result ? buildSummaryLine(result, tx) : null;

  return (
    <section className="wizard-card">
      <h2 className="wizard-card__title">
        <img className="admin-title__icon" src={ICONS.previousYear} alt="" aria-hidden="true" /> {tx("Outros anos")}
      </h2>
      <p className="admin-intro">
        {tx("Traga o que já existe de outro acampamento: categorias, times, quartos, ônibus, equipe, acampantes, programação, documentos e configurações. Cada bloco vira registro NOVO deste ano (as pessoas são as mesmas do IPAlpha) — nada aqui altera o ano de origem.")}
      </p>

      <h3 className="cat-form__title">{tx("De onde importar")}</h3>
      <OptionCards label={tx("Ano de origem")} value={sourceId} disabled={busy} options={sourceOptions} onChange={(id) => { setSourceId(id); setResult(null); }} />

      <h3 className="cat-form__title">{tx("O que importar")}</h3>
      <ul className="notif-list">
        {BLOCKS.map((b) => {
          const count = counts ? counts[b.key] : undefined;
          const on = blocks.has(b.key);
          return (
            <li key={b.key} className={`notif-item ${on ? "notif-item--on" : ""}`}>
              <span className="notif-item__emoji" aria-hidden="true">
                {b.icon ? <img src={b.icon} alt="" className="notif-item__icon" /> : b.emoji}
              </span>
              <div className="notif-item__body">
                <h3 className="notif-item__title">
                  {tx(b.label)} <span className="cat-tab__count">{count === undefined ? "…" : count}</span>
                </h3>
                {b.key === "schedule" && on && (
                  <div className="wizard-previous__sub">
                    <Toggle checked={withRoles} disabled={busy} label={tx("com as funções")} onChange={setWithRoles} />
                    <Toggle checked={withAssignments} disabled={busy || !blocks.has("staff")} label={tx("com a escala")} onChange={setWithAssignments} />
                    {!blocks.has("staff") && <p className="cat-hint">{tx("Para importar a escala, importe também a Equipe.")}</p>}
                  </div>
                )}
              </div>
              <Toggle checked={on} disabled={busy || !summary || count === 0} label={on ? tx("Ligado") : tx("Desligado")} onChange={(v) => toggleBlock(b.key, v)} />
            </li>
          );
        })}
      </ul>
      {needsPlacement && <p className="cat-hint">{tx("Para manter quarto, time e ônibus das pessoas, importe esses blocos também.")}</p>}

      {error && <p className="message message--error">{error}</p>}
      {summaryLine && <p className="message message--ok">✅ {summaryLine}</p>}

      <div className="cat-form__actions">
        <button type="button" className="button button--primary" disabled={busy || !sourceId || blocks.size === 0} onClick={() => void doImport()}>
          {busy ? tx("Importando…") : tx("Importar de {year}", { year: sourceYear })}
        </button>
      </div>
      <p className="cat-hint">{tx("Pode rodar de novo sem medo — quem já está neste ano é ignorado, nunca duplicado.")}</p>
    </section>
  );
}

function buildSummaryLine(result: ImportFromCampResult, tx: (pt: string, vars?: Record<string, string | number>) => string): string {
  const parts: string[] = [];
  let skipped = 0;
  let waiting = 0;
  for (const b of BLOCKS) {
    const r = result[b.key];
    if (!r) continue;
    skipped += r.skipped;
    waiting += r.membershipsFailed ?? 0;
    if (r.created > 0) parts.push(tx("{n} {unit}", { n: r.created, unit: tx(b.unit[r.created === 1 ? 0 : 1]) }));
  }
  const base = parts.length > 0 ? parts.join(", ") : tx("Nada novo para importar");
  const line = skipped > 0 ? tx("{summary} · {n} já estavam aqui", { summary: base, n: skipped }) : base;
  return waiting > 0 ? `${line} · ${tx("{n} pessoa(s) ainda precisa(m) ser incluída(s) nesta edição pelo Mordomia", { n: waiting })}` : line;
}
