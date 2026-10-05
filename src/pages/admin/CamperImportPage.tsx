import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { analyzeCamperFile, applyCamperImport, createImportLeader, getCamperImportProgress, importErrorMessage, listImportFields, type CamperImport, type ImportField, type ImportReviewItem } from "../../api/camperImports";
import ImportPhaseBar, { CAMPER_PHASES, type ImportPhaseInfo } from "../../components/ImportPhaseBar";
import Breadcrumbs from "../../components/Breadcrumbs";
import { CheckGlyph, DownloadGlyph, EllipsisGlyph, EyeGlyph, SkipGlyph } from "../../components/Glyph";
import { ICONS } from "../../icons";
import { useRoute } from "../../router";
import { peekPendingImportFile, useFileDrop } from "../../hooks/useFileDrop";
import CpfInput from "../../components/CpfInput";
import PhoneInput from "../../components/PhoneInput";
import NoPillIcon from "../../components/NoPillIcon";
import { useCollectionOrEmpty } from "../../store";
import type { Category } from "../../api/categories";
import { formatCpf, validCpf } from "../../cpf";
import { maskBrazilPhone } from "../../phone";
import { formatBrazilPhoneClient } from "../../phoneFormat";
import { collatorLocale, useI18n } from "../../i18n";

interface Props { token: string; /** where "Ver acampantes" / the breadcrumb lead — the setup wizard continues instead of leaving */ onDone?: () => void }
type Delta = Record<string, { value?: string; skip?: boolean }>;

type Stage = "file" | "mapping" | "panic" | "review" | "summary" | "done";

const REVIEW_LABEL: Record<ImportReviewItem["kind"], string> = {
  duplicate:"Cadastros repetidos",leader: "Líderes", date: "Datas", guardianName: "Responsáveis", phone: "Telefones", cpf: "CPFs", email: "E-mails",
};
const OPTIONAL_FIELD_LABEL: Record<string, string> = { cpf: "CPF", guardianCpf: "CPF do responsável", email: "E-mail" };
const IMPORTANT = new Set(["duplicate","leader", "date", "guardianName", "phone"]);
const REVIEW_ORDER: ImportReviewItem["kind"][] = ["duplicate","leader", "date", "guardianName", "phone", "cpf", "email"];
const ID_RE=/^(?:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}|[a-f0-9]{24})$/i;
const ID_HEADER_RE=/^(?:id|uuid|guid|_id|[a-z0-9]+_id|[a-z0-9]+ id)$/i;
const isIgnoredColumn=(source:string)=>ID_HEADER_RE.test(source.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim());
const unassignedColumns=(columns:{source:string;target:string|null;samples:string[]}[])=>columns.filter((c)=>!c.target&&c.samples.length&&!isIgnoredColumn(c.source));

export default function CamperImportPage({ token, onDone }: Props) {
  const { tx } = useI18n();
  const { navigate } = useRoute();
  /** finished: continue the wizard when embedded, else back to the campers list */
  const leave = () => (onDone ? onDone() : navigate("/campers"));
  const [file, setFile] = useState<File | null>(null);
  const [fields, setFields] = useState<{ key: ImportField; label: string }[]>([]);
  const [record, setRecord] = useState<CamperImport | null>(null);
  const [stage, setStage] = useState<Stage>("file");
  const [delta, setDelta] = useState<Delta>({});
  const [reviewIndex, setReviewIndex] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [declinedCategoryIds, setDeclinedCategoryIds] = useState<Set<string>>(() => new Set());
  const [duplicateChoice,setDuplicateChoice]=useState<"update"|"keep"|"merge"|"">("");
  const [busy, setBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [phase, setPhase] = useState<ImportPhaseInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ imported: number; created: { kind: string; count: number; label: string }[]; skipped: number } | null>(null);
  /** the analysis as it was right before Apply — the server empties rows / preview once applied; kept in memory only for "Baixar não importados" */
  const [appliedFrom, setAppliedFrom] = useState<CamperImport | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const activeInput = useRef<HTMLInputElement | HTMLSelectElement>(null);
  const lastSkipped = useRef<string | null>(null);
  const progressId = useRef("");

  useEffect(() => { void listImportFields(token).then(setFields).catch(() => undefined); }, [token]);
  const categories = useCollectionOrEmpty("categories");
  const bedrooms=useCollectionOrEmpty("bedrooms"),teams=useCollectionOrEmpty("teams"),transports=useCollectionOrEmpty("transports"),staff=useCollectionOrEmpty("staff");

  const { dragging, handlers } = useFileDrop(pickFile);
  const startedPending = useRef(false);

  /** rows dropped by skipping an essential item — they will not be imported, so their remaining questions are moot */
  const deadRows = useMemo(() => {
    const rows = new Set<number>();
    if (record) for (const item of record.reviews) {
      if (IMPORTANT.has(item.kind) && delta[item.id]?.skip) for (const row of item.affectedRows?.length ? item.affectedRows : [item.row]) rows.add(row);
    }
    return rows;
  }, [record, delta]);
  const isDropped = (item: ImportReviewItem) => !delta[item.id]?.skip && (item.affectedRows?.length ? item.affectedRows : [item.row]).every((row) => deadRows.has(row));

  /** CPF/e-mail may stay blank; a filled value must be valid — otherwise Continuar stays locked */
  function reviewAccepts(kind: ImportReviewItem["kind"], value: string): boolean {
    if (kind === "cpf") return !value || validCpf(value);
    if (kind === "email") return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
    if (kind === "phone") return value.replace(/\D/g, "").length === 11;
    return !!value;
  }

  const duplicateTotal=record?.reviews.filter((r)=>r.kind==="duplicate").length??0;
  const reviews = useMemo(() => {
    if (!record) return [];
    return record.reviews
      .filter((r) => !(r.kind==="duplicate"&&duplicateTotal>7) && IMPORTANT.has(r.kind) && !isDropped(r))
      .slice()
      .sort((a, b) => REVIEW_ORDER.indexOf(a.kind) - REVIEW_ORDER.indexOf(b.kind) || a.row - b.row);
  }, [record, deadRows, delta,duplicateTotal]);
  const current = reviews[reviewIndex] ?? null;
  const batchDuplicatePending=duplicateTotal>7&&!duplicateChoice;
  useEffect(() => {
    // everything left was answered or dropped — or a stale index needs clamping
    if (stage === "review" && !current && !batchDuplicatePending) {
      if (reviews.length) setReviewIndex(reviews.length - 1);
      else setStage("summary");
    }
  }, [stage, current, reviews.length,batchDuplicatePending]);
  useEffect(() => {
    // advance only after the skip dropped the moot questions and the list settled
    if (stage === "review" && current && lastSkipped.current === current.id) {
      lastSkipped.current = null;
      next();
    }
  }, [stage, current, delta]);
  const completed = reviews.filter((r) => delta[r.id]?.skip || (delta[r.id]?.value ?? r.value)).length;
  const skippedRowNumbers = useMemo(() => new Set((record?.reviews??[]).flatMap((r) => {const choice=delta[r.id]?.value||(r.kind==="duplicate"?duplicateChoice:"");return r.kind==="duplicate"&&choice==="keep"?[r.row]:IMPORTANT.has(r.kind)&&delta[r.id]?.skip?(r.affectedRows?.length?r.affectedRows:[r.row]):[]}).map(Number)), [record, delta,duplicateChoice]);
  const skippedRows = skippedRowNumbers.size;
  const optionalReviews = record?.reviews.filter((r) => !IMPORTANT.has(r.kind) && !isDropped(r)) ?? [];

  useEffect(() => {
    if (stage === "review" && current && ["leader", "guardianName", "phone", "cpf", "email"].includes(current.kind)) window.setTimeout(() => activeInput.current?.focus(), 80);
  }, [stage, current?.id]);

  useEffect(() => {
    if (!analyzing) return;
    const timer = window.setInterval(() => {
      if (progressId.current) void getCamperImportProgress(token, progressId.current).then(setPhase).catch(() => undefined);
    }, 700);
    return () => window.clearInterval(timer);
  }, [analyzing, token]);

  /** choosing / dropping a file starts the analysis right away — no extra button */
  function pickFile(f: File | null) {
    setFile(f);
    if (f) void analyze(undefined, f);
  }

  useEffect(() => {
    const pending = peekPendingImportFile();
    if (!pending || startedPending.current) return;
    startedPending.current = true;
    pickFile(pending);
  }, []);

  async function analyze(mapping?: Record<string, string | null>, forFile?: File) {
    const target = forFile ?? file;
    if (!target) return;
    progressId.current = crypto.randomUUID();
    setAnalyzing(true); setPhase(null); setBusy(true); setError(null);
    try {
      const next = await analyzeCamperFile(token, target, mapping, progressId.current);
      setRecord(next);
      setDelta(Object.fromEntries(next.reviews.map((r) => [r.id, { value: r.value, skip: r.skip }])));
      setReviewIndex(0);
      setDeclinedCategoryIds(new Set());
      setDuplicateChoice("");
      if (next.status === "panic") setStage("panic");
      else if (next.status === "needs_mapping") setStage("mapping");
      else if (next.reviews.some((r) => IMPORTANT.has(r.kind))) setStage("review");
      else setStage("summary");
    } catch (e) { setError(e instanceof Error ? e.message : tx("Não foi possível analisar a planilha.")); }
    finally { setBusy(false); setAnalyzing(false); setPhase(null); }
  }

  function setValue(item: ImportReviewItem, value: string) { setDelta((d) => ({ ...d, [item.id]: { ...d[item.id], value, skip: false } })); }
  function skip(item: ImportReviewItem) { lastSkipped.current = item.id; setDelta((d) => ({ ...d, [item.id]: { ...d[item.id], skip: true } })); }
  function next() { if (reviewIndex + 1 < reviews.length) setReviewIndex((n) => n + 1); else setStage("summary"); }
  function previous() { if (reviewIndex > 0) setReviewIndex((n) => n - 1); else { setRecord(null); setFile(null); setStage("file"); } }

  async function createLeader(item: ImportReviewItem) {
    const phone = delta[item.id]?.value ?? "";
    setBusy(true); setError(null);
    try {
      const created = await createImportLeader(token, record!.id, item.id, phone);
      setValue(item, created.staff.id);
      setRecord(created.import);
    } catch (e) { setError(e instanceof Error ? e.message : tx("Não foi possível criar o líder.")); }
    finally { setBusy(false); }
  }

  async function apply() {
    if (!record) return;
    setBusy(true); setError(null);
    try {
      if (!file) throw new Error(tx("Escolha novamente a planilha original."));
      const result = await applyCamperImport(token, record.id, file, delta, [...declinedCategoryIds],duplicateChoice);
      setOutcome({ imported: result.inserted + (result.updated ?? 0), created: createdCounters(record.createdItems), skipped: typeof result.skipped === "number" ? result.skipped : skippedRows });
      setAppliedFrom(record);
      setRecord(result.import); setStage("done");
    } catch (e) { setError(importErrorMessage(e, tx("Não foi possível importar."), tx)); }
    finally { setBusy(false); }
  }

  function downloadSkipped() {
    const record = appliedFrom;
    if (!record) return;
    const reasons = new Map<number, string>();
    for (const review of record.reviews) {
      const choice=delta[review.id]?.value||(review.kind==="duplicate"?duplicateChoice:"");
      if(review.kind==="duplicate"&&choice==="keep")reasons.set(review.row,tx("Cadastro existente mantido"));
      else if(delta[review.id]?.skip)for (const row of review.affectedRows?.length ? review.affectedRows : [review.row]) reasons.set(row, tx("Ignorado: {kind}", { kind: tx(REVIEW_LABEL[review.kind]) }));
    }
    const labels = previewLabelMap(record, categories);
    const skipped = previewRows(record, delta).filter((item) => reasons.has(Number(item.row)));
    const columns = previewColumns(skipped, labels);
    const rows = skipped.map((item) => ({
      ...Object.fromEntries(columns.map((column) => [tx(column.label), displayPreviewValue(column.key, item[column.key], labels, tx)])),
      [tx("Motivo")]: reasons.get(Number(item.row)),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), tx("Não importados"));
    XLSX.writeFile(wb, `nao-importados-${record.fileName.replace(/\.[^.]+$/, "")}.xlsx`);
  }

  if (stage === "done" && record) return (
    <div className="admin-page import-page">
      <Breadcrumbs items={[{ label: tx("Acampantes"), onClick: leave }, { label: tx("Importação concluída") }]} />
      <section className="import-success">
        <span className="import-success__check"><CheckGlyph size={54} /></span>
        <h1 className="admin-title">{tx("Importação concluída")}</h1>
        <p className="admin-intro">{tx("As crianças já estão no sistema. A revisão das observações por IA continua em segundo plano e grava as informações de saúde direto no IPAlpha.")}</p>
        {(record.needsSignIn || record.status === "needsSignIn") && <p className="message message--warn">{tx("A sua entrada no IPAlpha terminou enquanto a IA organizava as informações de saúde. Nada se perdeu: entre de novo e continue a importação em Configurações.")}</p>}
        {outcome && <div className="import-stats">
          <span className="import-stats__success"><b>{outcome.imported}</b> {tx("crianças")}</span>
          {outcome.created.map((counter) => <span className="import-stats__success" key={counter.kind}><b>{counter.count}</b> {tx(counter.label)}</span>)}
          <span className="import-stats__warning"><b>{outcome.skipped}{outcome.skipped > 0 && appliedFrom && <button type="button" className="icon-btn icon-btn--bare import-download-icon" title={tx("Baixar não importados")} aria-label={tx("Baixar não importados")} onClick={downloadSkipped}><DownloadGlyph /></button>}</b> {tx("ignoradas")}</span>
        </div>}
        <button type="button" className="button button--primary" onClick={leave}>{tx("Ver acampantes")}</button>
      </section>
    </div>
  );

  return (
    <div className="admin-page admin-page--wide import-page">
      <Breadcrumbs items={[{ label: tx("Acampantes"), onClick: leave }, { label: tx("Importar planilha") }]} />
      <header className="admin-head">
        <h1 className="admin-title"><img className="admin-title__icon" src={ICONS.importCampers} alt="" /> {tx("Importar acampantes")}</h1>
      </header>
      {stage !== "file" && <ImportProgress stage={stage} reviewDone={completed} reviewTotal={reviews.length} />}
      {analyzing && <ImportPhaseBar phases={CAMPER_PHASES} progress={phase} />}
      {error && <p className="message message--error">{error}</p>}

      {stage === "file" && (
        <section className={`import-drop${dragging ? " import-drop--over" : ""}`} {...handlers}>
          <img src={ICONS.camper} alt="" className="import-drop__icon" />
          <h2>{tx("Arraste o CSV ou Excel aqui")}</h2>
          <p>{tx("Solte o arquivo nesta área ou escolha abaixo. A IA compara as colunas; depois o sistema cruza quartos, líderes, transporte, times e saúde em paralelo.")}</p>
          <input ref={fileInput} hidden type="file" accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
          <button type="button" className="button button--primary" disabled={busy} onClick={() => fileInput.current?.click()}>{file ? file.name : tx("Escolher planilha")}</button>
          <p className="cat-hint">{tx("Nada é importado nesta fase. Itens novos ficam em rascunho até você aplicar.")}</p>
        </section>
      )}

      {stage === "mapping" && record && (
        <ColumnMapping record={record} fields={fields} busy={busy} onSubmit={(mapping) => void analyze(mapping)} />
      )}

      {stage === "panic" && record && (
        <section className="import-review">
          <h2>{tx("As datas precisam ser corrigidas")}</h2>
          <p className="message message--error">{record.error}</p>
          <p className="admin-intro">{tx("A análise dos outros campos terminou e o dicionário foi guardado. Corrija as datas na planilha para dd/MM/aaaa e envie o arquivo novamente.")}</p>
          <div className="cat-form__actions">
            <button type="button" className="button button--primary" onClick={() => { setRecord(null); setFile(null); setStage("file"); window.setTimeout(() => fileInput.current?.click(), 0); }}>{tx("Escolher arquivo corrigido")}</button>
          </div>
        </section>
      )}

      {stage === "review" && record && (batchDuplicatePending||current) && (
        <section className="import-review">
          {batchDuplicatePending?<><header className="import-review__head"><div><p className="import-review__eyebrow">{tx("Cadastros repetidos")}</p><h2>{tx("{n} crianças já cadastradas", { n: duplicateTotal })}</h2></div></header><p className="admin-intro">{tx("Escolha a regra antes das outras revisões. A prévia, os contadores e os itens novos usarão esta decisão.")}</p><DuplicateBatchChoice value={duplicateChoice} onChange={(value)=>{setDuplicateChoice(value);if(!reviews.length)setStage("summary")}}/></>:current&&<><header className="import-review__head">
            <div><p className="import-review__eyebrow">{tx(REVIEW_LABEL[current.kind])}</p><h2>{current.kidName}</h2></div>
            {current.kind!=="duplicate"&&<span className="checkin-progress">{reviewIndex + 1}/{reviews.length}</span>}
          </header>
          {current.kind!=="duplicate"&&<p className="admin-intro">{tx("Algumas coisas eu não consegui resolver sozinho. Você pode corrigir ou ignorar; itens obrigatórios ignorados não serão importados.")}</p>}
          {current.kind==="duplicate"?<DuplicateReview item={current} value={delta[current.id]?.value??""} labels={duplicateLabels(categories,bedrooms,teams,transports,staff,record)} onChange={(v)=>setValue(current,v)}/>: <><ReviewContext item={current} />
          {current.affectedRows && current.affectedRows.length > 1 && <p className="cat-hint">{tx("Esta correção vale para {n} crianças.", { n: current.affectedRows.length })}</p>}
          <ReviewEditor item={current} value={delta[current.id]?.value ?? current.value} inputRef={activeInput} busy={busy} onChange={(v) => setValue(current, v)} onCreateLeader={() => void createLeader(current)} onEditLeader={(id) => window.open(`/staff/${id}/edit`, "_blank", "noopener,noreferrer")} /></>}
          <div className="cat-form__actions import-review__actions">
            <button type="button" className="link-btn" onClick={previous}>{tx("Voltar")}</button>
            {current.kind!=="duplicate"&&(IMPORTANT.has(current.kind)
              ? <button type="button" className="button button--warn" onClick={() => skip(current)}>{tx("Pular")} <SkipGlyph /></button>
              : <button type="button" className="button button--secondary" onClick={() => skip(current)}>{tx("Ignorar")}</button>)}
            <button type="button" className="button button--primary" disabled={busy || (current.kind==="duplicate"?!delta[current.id]?.value:!reviewAccepts(current.kind, delta[current.id]?.value ?? ""))} onClick={next}>{tx("Continuar")}</button>
          </div></>}
        </section>
      )}

      {stage === "summary" && record && (
        <section className="import-summary">
          <h2>{tx("Pronto para importar")}</h2>
          {unassignedColumns(record.columns).length > 0 && <p className="cat-hint">{tx("{n} coluna(s) sem destino reconhecido — os valores vão para as observações.", { n: unassignedColumns(record.columns).length })} <button type="button" className="link-btn" onClick={() => setStage("mapping")}>{tx("Atribuir colunas")}</button></p>}
          {record.createdItems.some((item) => item.kind !== "categoryOption" && item.kind !== "staff") && <div className="import-created">
            <p className="admin-intro">{tx("Também serão publicados:")}</p>
            <ul className="import-created__list">{createdTopics(record.createdItems.filter((item) => item.kind !== "categoryOption" && item.kind !== "staff")).map((group) => <li key={group.topic}>
              <strong className="import-created__topic"><img src={CREATED_KIND_ICON[group.kind]} alt="" /> {tx(group.topic)}</strong>
              <span className="import-created__values">{group.values.map((value) => <span key={value} className="import-chip">{value}</span>)}</span>
            </li>)}</ul>
          </div>}
          {record.createdItems.some((item) => item.kind === "categoryOption") && <CategoryOptionReview record={record} categories={categories} declined={declinedCategoryIds} onChange={setDeclinedCategoryIds} />}
          {record.createdItems.some((item) => item.kind === "staff") && <p className="import-created-staff">{createdStaffMessage(record.createdItems, tx)}</p>}
          <div className="import-preview-head">
            <h3>{tx("Prévia")}</h3>
            <button type="button" className={`import-preview-toggle${previewOpen ? " is-visible" : ""}`} aria-label={previewOpen ? tx("Ocultar prévia") : tx("Mostrar prévia")} aria-pressed={previewOpen} title={previewOpen ? tx("Ocultar prévia") : tx("Mostrar prévia")} onClick={() => setPreviewOpen((v) => !v)}><EyeGlyph /></button>
          </div>
          {previewOpen && <PreviewTable record={record} delta={delta} skippedRowNumbers={skippedRowNumbers} categories={categories} declinedCategoryIds={declinedCategoryIds} duplicateChoice={duplicateChoice} />}
          {optionalReviews.length > 0 && <div className="import-optional-review">
            <p>{optionalReviews.length === 1 ? tx("1 CPF ou e-mail inválido ficará em branco:") : tx("{n} CPFs ou e-mails inválidos ficarão em branco:", { n: optionalReviews.length })}</p>
            <ul className="import-optional-review__list">{optionalReviews.map((item) => <li key={item.id}><strong>{item.kidName}</strong> · {tx(OPTIONAL_FIELD_LABEL[item.field] ?? REVIEW_LABEL[item.kind])}: <s>{item.original}</s></li>)}</ul>
          </div>}
          <div className="cat-form__actions">
            <button type="button" className="button button--secondary" onClick={() => reviews.length ? setStage("review") : setStage("file")}>{tx("Voltar")}</button>
            <button type="button" className="button button--primary" disabled={busy || record.status === "panic" || record.status === "needs_mapping"||(duplicateTotal>7&&!duplicateChoice)} onClick={() => void apply()}>{busy ? tx("Importando…") : tx("Aplicar importação")}</button>
          </div>
        </section>
      )}
    </div>
  );
}

function ImportProgress({ stage, reviewDone, reviewTotal }: { stage: Stage; reviewDone: number; reviewTotal: number }) {
  const { tx } = useI18n();
  const index = stage === "mapping" || stage === "panic" ? 1 : stage === "review" ? 2 : 3;
  const pct = stage === "review" && reviewTotal ? 33 + Math.round((reviewDone / reviewTotal) * 34) : index * 33;
  return <div className="import-progress" aria-label={tx("Progresso {n}%", { n: Math.min(pct, 100) })}><span style={{ width: `${Math.min(pct, 100)}%` }} /><ol><li className={index >= 1 ? "on" : ""}>{tx("Colunas")}</li><li className={index >= 2 ? "on" : ""}>{tx("Revisão")}</li><li className={index >= 3 ? "on" : ""}>{tx("Prévia")}</li></ol></div>;
}

const REQUIRED_FIELDS: { key: ImportField; label: string }[] = [
  { key: "name", label: "Nome da criança" },
  { key: "birthDate", label: "Data de nascimento" },
];

const CREATED_KIND_LABEL: Record<string, string> = { transportation: "Transporte", team: "Time", bedroom: "Quarto", staff: "Líderes" };
const CREATED_KIND_ICON: Record<string, string> = { transportation: ICONS.transport, team: ICONS.team, bedroom: ICONS.bunk, staff: ICONS.leaderFace };
const CREATED_COUNTER_LABEL: Record<string, [string, string]> = {
  transportation: ["transporte novo", "transportes novos"],
  team: ["time novo", "times novos"],
  bedroom: ["quarto novo", "quartos novos"],
};

function createdCounters(items: { kind: string }[]): { kind: string; count: number; label: string }[] {
  return Object.entries(CREATED_COUNTER_LABEL).flatMap(([kind, labels]) => {
    const count = items.filter((item) => item.kind === kind).length;
    return count ? [{ kind, count, label: count === 1 ? labels[0] : labels[1] }] : [];
  });
}

function createdStaffMessage(items: { kind: string; label: string }[], tx: (pt: string, vars?: Record<string, string | number>) => string): string {
  const names = items.filter((item) => item.kind === "staff").map((item) => item.label);
  return names.length === 1 ? tx("Líder já criado: {name}.", { name: names[0] }) : tx("{n} líderes já criados: {names}.", { n: names.length, names: names.join(", ") });
}

/** same icon rule the kid / staff form uses for a category (CategoryFields.categoryIcon) */
function categoryIcon(cat: Category | undefined) {
  if (cat?.key === "alergia-medicamentos") return <NoPillIcon />;
  return cat?.emoji ?? "🏷️";
}

function CategoryOptionReview({ record, categories, declined, onChange }: { record: CamperImport; categories: Category[]; declined: Set<string>; onChange: (ids: Set<string>) => void }) {
  const { tx } = useI18n();
  const items = record.createdItems.filter((item) => item.kind === "categoryOption");
  const categoryOf = (item: (typeof items)[number]) => item.label.includes(": ") ? item.label.slice(0, item.label.indexOf(": ")) : tx("Categoria");
  const valueOf = (item: (typeof items)[number]) => item.label.includes(": ") ? item.label.slice(item.label.indexOf(": ") + 2) : item.label;
  const examplesOf = (id: string) => {
    const rawValues = new Set(record.dictionaries.filter((entry) => entry.value === id && entry.raw).map((entry) => entry.raw));
    const examples: { row: number; raw: string }[] = [];
    for (const row of record.preview) {
      const notes = row.categoryNotesById && typeof row.categoryNotesById === "object" ? row.categoryNotesById as Record<string, string[]> : {};
      if (!notes[id]?.length) continue;
      const raw = [...rawValues].find((value) => notes[id].some((note) => note.includes(value))) ?? [...rawValues][0];
      if (raw && !examples.some((example) => example.raw === raw)) examples.push({ row: Number(row.row), raw });
      if (examples.length === 3) break;
    }
    return examples;
  };
  const toggle = (id: string, checked: boolean) => {
    const next = new Set(declined);
    if (checked) next.delete(id); else next.add(id);
    onChange(next);
  };
  return <section className="import-category-review">
    <div><h3>{tx("Novas opções encontradas")}</h3><p>{tx("Marque apenas o que deve entrar nas listas do sistema. O que ficar desmarcado será mantido nas observações da pessoa.")}</p></div>
    <div className="import-category-review__table-wrap"><table className="import-category-review__table"><thead><tr><th>{tx("Inserir")}</th><th>{tx("Lista")}</th><th>{tx("Nova opção")}</th><th>{tx("Exemplos da planilha")}</th></tr></thead><tbody>{items.map((item) => {
      const topic = categoryOf(item);
      const cat = categories.find((category) => category.name.trim().toLowerCase() === topic.trim().toLowerCase());
      const checked = !declined.has(item.id);
      return <tr key={item.id} className={checked ? undefined : "is-declined"}>
        <td><input type="checkbox" checked={checked} aria-label={tx("Inserir {name}", { name: valueOf(item) })} onChange={(event) => toggle(item.id, event.target.checked)} /></td>
        <td><span className="import-category-review__topic">{categoryIcon(cat)} {topic}</span></td>
        <td><strong>{valueOf(item)}</strong></td>
        <td>{examplesOf(item.id).map((example) => <span className="import-category-review__example" key={`${example.row}-${example.raw}`}><strong>{tx("Linha {n}:", { n: example.row })}</strong> {example.raw}</span>)}</td>
      </tr>;
    })}</tbody></table></div>
    {declined.size > 0 && <p className="import-category-review__warning">{tx("As informações desmarcadas serão movidas para o campo Observações de cada pessoa.")}</p>}
  </section>;
}

/** groups the “Também serão publicados” items by topic — category options carry "Tópico: valor" labels */
function createdTopics(items: { kind: string; label: string }[]): { topic: string; values: string[]; kind: string }[] {
  const topics = new Map<string, { topic: string; values: string[]; kind: string }>();
  for (const item of items) {
    const split = item.kind === "categoryOption" && item.label.includes(": ") ? item.label.indexOf(": ") : -1;
    const topic = split >= 0 ? item.label.slice(0, split) : CREATED_KIND_LABEL[item.kind] ?? "Outros";
    const value = split >= 0 ? item.label.slice(split + 2) : item.label;
    const group = topics.get(topic) ?? { topic, values: [], kind: split >= 0 ? "categoryOption" : item.kind };
    group.values.push(value);
    topics.set(topic, group);
  }
  return [...topics.values()];
}

export function ColumnMapping({ record, fields, busy, onSubmit }: { record: CamperImport; fields: { key: ImportField; label: string }[]; busy: boolean; onSubmit: (mapping: Record<string, string | null>) => void }) {
  const { tx } = useI18n();
  const [mapping, setMapping] = useState<Record<string, string | null>>(() => Object.fromEntries(record.columns.map((c) => [c.source, c.target])));
  const used = new Set(Object.values(mapping).filter(Boolean));
  const missing = REQUIRED_FIELDS.filter((f) => !used.has(f.key));
  const unknown = record.columns.filter((c) => !mapping[c.source] && c.samples.length && !isIgnoredColumn(c.source));
  const sourceOf = (key: string) => Object.entries(mapping).find(([, t]) => t === key)?.[0] ?? "";
  const assign = (source: string, target: string | null) => setMapping((m) => ({ ...m, [source]: target }));
  /** identity fields may take any column that is not another identity field's source */
  const candidates = (fieldKey: string) => record.columns.filter((c) => c.samples.length && !isIgnoredColumn(c.source) && (!mapping[c.source] || !REQUIRED_FIELDS.some((r) => r.key === mapping[c.source] && r.key !== fieldKey)));
  function pickIdentity(fieldKey: string, source: string) {
    setMapping((m) => {
      const next = { ...m };
      for (const [s, t] of Object.entries(next)) if (t === fieldKey) next[s] = null;
      if (source) next[source] = fieldKey;
      return next;
    });
  }
  return <section className="import-mapping">
    <h2>{missing.length ? tx("Escolha as colunas essenciais") : tx("Colunas sem destino")}</h2>
    <p className="admin-intro">{missing.length ? <>{tx("Não encontrei")} <b>{missing.map((f) => tx(f.label)).join(tx(" e "))}</b>. {tx("As demais colunas já foram comparadas e reconhecidas.")}</> : tx("Estas colunas não foram reconhecidas. Atribua um destino ou deixe os valores irem para as observações.")}</p>
    {missing.map((f) => { const source = sourceOf(f.key); const column = record.columns.find((c) => c.source === source); return (
      <label key={f.key} className="import-column import-column--required">
        <span className="import-column__source">{tx(f.label)}</span>
        <select className="cat-input" value={source} onChange={(e) => pickIdentity(f.key, e.target.value)}>
          <option value="">{tx("Escolha a coluna…")}</option>
          {candidates(f.key).map((c) => <option key={c.source} value={c.source}>{c.source}</option>)}
        </select>
        <span className="import-column__samples">{column ? column.samples.join(" · ") || tx("Sem exemplos") : ""}</span>
      </label>); })}
    {unknown.length > 0 && <details className="import-mapping__extra" open={!missing.length}>
      <summary className="link-btn">{tx("{n} colunas sem destino", { n: unknown.length })}</summary>
      <div className="import-mapping__list">{unknown.map((c) => (
        <label key={c.source} className="import-column">
          <span className="import-column__source">{c.source}</span>
          <span className="import-column__samples">{c.samples.join(" · ")}</span>
          <select className="cat-input" value={mapping[c.source] ?? ""} onChange={(e) => assign(c.source, e.target.value || null)}>
            <option value="">{tx("Ignorar")}</option>
            {fields.map((f) => <option key={f.key} value={f.key} disabled={used.has(f.key) && mapping[c.source] !== f.key}>{tx(f.label)}</option>)}
          </select>
        </label>))}</div>
    </details>}
    {record.error && missing.length === 0 && <p className="message message--error">{record.error}</p>}
    <div className="cat-form__actions"><button type="button" className="button button--primary" disabled={busy || missing.length > 0} onClick={() => onSubmit(mapping)}>{busy ? tx("Analisando…") : tx("Continuar")}</button></div>
  </section>;
}

const DUPLICATE_FIELDS=["name","birthDate","guardianName","guardianPhone","guardianEmail","guardian2Name","guardian2Phone","bedroom","team","caretakerId","transportation","bed","school","schoolGrade","church","weightKg","allergies","drugAllergies","healthIssues","foodRestrictions","healthNotes","generalNotes","bedroomPreference","emergencyContact"];
function usefulEntries(data:Record<string,unknown>|undefined){return DUPLICATE_FIELDS.flatMap((key)=>{const value=data?.[key];if(value==null||value===""||(Array.isArray(value)&&!value.length))return [];return [{key,value}]})}
function duplicateFieldLabel(key:string){return PREVIEW_COLUMNS.find((column)=>column.key===key)?.label??key}
function duplicateLabels(categories:Category[],bedrooms:{id:string;name:string}[],teams:{id:string;name:string}[],transports:{id:string;label:string}[],staff:{id:string;name:string}[],record:CamperImport){const labels=previewLabelMap(record,categories);for(const room of bedrooms)labels.set(room.id,room.name);for(const team of teams)labels.set(team.id,team.name);for(const transport of transports)labels.set(transport.id,transport.label);for(const member of staff)labels.set(member.id,member.name);return labels}
function duplicateText(key:string,value:unknown,labels:Map<string,string>){if(value==null||value==="")return "—";if(Array.isArray(value))return value.map((item)=>{const text=String(item),label=labels.get(text);if(label&&!ID_RE.test(label))return label;return ID_RE.test(text)?"—":text;}).join(", ")||"—";const text=String(value);const label=labels.get(text);if(label&&!ID_RE.test(label))return label;if(ID_RE.test(text))return "—";return displayPreviewValue(key,value,labels)}
function DuplicateCard({title,data,other,labels,source,selected,onClick}:{title:string;data:Record<string,unknown>|undefined;other:Record<string,unknown>|undefined;labels:Map<string,string>;source:"system"|"sheet";selected:boolean;onClick:()=>void}){const { tx } = useI18n();return <button type="button" className={`import-duplicate-card import-duplicate-card--${source}${selected?" is-selected":""}`} aria-pressed={selected} onClick={onClick}><strong>{title}</strong><table className="import-duplicate-card__table"><tbody>{usefulEntries(data).map(({key,value})=>{const different=duplicateText(key,value,labels)!==duplicateText(key,other?.[key],labels);return <tr key={key} className={different?"is-different":undefined}><th>{tx(duplicateFieldLabel(key))}</th><td>{duplicateText(key,value,labels)}</td></tr>})}</tbody></table></button>}
function DuplicateReview({item,value,labels,onChange}:{item:ImportReviewItem;value:string;labels:Map<string,string>;onChange:(value:string)=>void}){const { tx } = useI18n();const merged=value==="merge";return <div className="import-duplicate"><p className="admin-intro">{tx("Já existe um cadastro com esta chave. Quarto, time, líder e transporte atuais serão mantidos.")}</p>{merged?<div className="import-duplicate-merged"><strong>{tx("Versão mesclada")}</strong><table className="import-duplicate-card__table"><tbody>{usefulEntries(item.mergedData).map(({key,value:fieldValue})=>{const old=item.existingData?.[key],incoming=item.incomingData?.[key],source=duplicateText(key,old,labels)===duplicateText(key,fieldValue,labels)?tx("Sistema"):duplicateText(key,incoming,labels)===duplicateText(key,fieldValue,labels)?tx("Planilha"):tx("Ambos");const sourceClass=duplicateText(key,old,labels)===duplicateText(key,fieldValue,labels)?"system":duplicateText(key,incoming,labels)===duplicateText(key,fieldValue,labels)?"sheet":"both";return <tr key={key}><th>{tx(duplicateFieldLabel(key))}</th><td>{duplicateText(key,fieldValue,labels)}</td><td><small className={`import-source import-source--${sourceClass}`}>{source}</small></td></tr>})}</tbody></table></div>:<div className="import-duplicate-grid"><DuplicateCard title={tx("Cadastro atual")} data={item.existingData} other={item.incomingData} labels={labels} source="system" selected={value==="keep"} onClick={()=>onChange("keep")}/><span className="import-duplicate-choice">{tx("ou")}</span><DuplicateCard title={tx("Planilha")} data={item.incomingData} other={item.existingData} labels={labels} source="sheet" selected={value==="update"} onClick={()=>onChange("update")}/></div>}{item.mergeAvailable&&<button type="button" className={`button ${merged?"button--primary":"button--secondary"}`} onClick={()=>onChange(merged?"":"merge")}>{merged?tx("Mesclando as versões"):tx("Mesclar informações")}</button>}</div>}
function DuplicateBatchChoice({value,onChange}:{value:"update"|"keep"|"merge"|"";onChange:(value:"update"|"keep"|"merge")=>void}){const { tx } = useI18n();return <section className="import-duplicate-batch"><h3>{tx("Cadastros repetidos")}</h3><p>{tx("Qual regra deve valer para todos?")}</p><div className="import-duplicate-batch__options">{([['update','Atualizar com a planilha'],['keep','Manter os cadastros atuais'],['merge','Mesclar as informações']] as const).map(([key,label])=><button type="button" key={key} className={value===key?"is-selected":undefined} aria-pressed={value===key} onClick={()=>onChange(key)}>{tx(label)}</button>)}</div></section>}

function ReviewContext({ item }: { item: ImportReviewItem }) {
  const { tx } = useI18n();
  const parts = [tx("Linha {n}", { n: item.row }), item.birthDate ? tx("Nascimento: {date}", { date: item.birthDate }) : null, item.age != null ? tx("{age} anos", { age: item.age }) : null, item.guardianName ? tx("Responsável: {name}", { name: item.guardianName }) : null, item.emergencyContact ? tx("Emergência: {contact}", { contact: item.emergencyContact }) : null].filter((p): p is string => !!p);
  return <div className="import-review__context">{parts.map((p) => <span key={p}>{p}</span>)}{item.original && <p><b>{tx("Na planilha:")}</b> {item.original}</p>}</div>;
}

function ReviewEditor({ item, value, inputRef, busy, onChange, onCreateLeader, onEditLeader }: { item: ImportReviewItem; value: string; inputRef: React.RefObject<HTMLInputElement | HTMLSelectElement | null>; busy: boolean; onChange: (v: string) => void; onCreateLeader: () => void; onEditLeader: (id: string) => void }) {
  const { tx } = useI18n();
  if (item.kind === "leader" && item.resolved && value) return <div className="import-leader import-leader--created"><span className="import-success__check import-success__check--small"><CheckGlyph size={26} /></span><strong>{tx("Líder criado")}</strong><button type="button" className="icon-btn icon-btn--bare" aria-label={tx("Editar líder")} title={tx("Editar líder")} onClick={() => onEditLeader(value)}><img className="pencil-icon" src={ICONS.pencil} alt="" /></button></div>;
  if (item.kind === "leader" && item.options?.length) return <label className="cat-field"><span className="cat-field__label">{tx("Escolha o líder")}</span><select ref={inputRef as React.RefObject<HTMLSelectElement>} className="cat-input" value={value} onChange={(e) => onChange(e.target.value)}><option value="">{tx("Selecione…")}</option>{item.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>;
  if (item.kind === "leader") return <div className="import-leader"><label className="cat-field cat-field--grow"><span className="cat-field__label">{tx("Novo líder")}</span><input className="cat-input" value={item.original} readOnly /></label><label className="cat-field cat-field--grow"><span className="cat-field__label">{tx("Celular")}</span><PhoneInput value={maskBrazilPhone(value)} onChange={onChange} inputRef={inputRef as React.RefObject<HTMLInputElement | null>} /></label><button type="button" className="button button--primary" disabled={busy || value.replace(/\D/g, "").length !== 11} onClick={onCreateLeader}>{tx("Criar")}</button></div>;
  if (item.kind === "cpf") return <label className="cat-field"><span className="cat-field__label">{tx("CPF")}</span><CpfInput value={formatCpf(value)} onChange={onChange} inputRef={inputRef as React.RefObject<HTMLInputElement | null>} /></label>;
  if (item.kind === "phone") return <label className="cat-field"><span className="cat-field__label">{tx("Telefone do responsável")}</span><PhoneInput value={maskBrazilPhone(value)} onChange={onChange} inputRef={inputRef as React.RefObject<HTMLInputElement | null>} /></label>;
  const type = item.kind === "date" ? "text" : item.kind === "email" ? "email" : "text";
  return <label className="cat-field"><span className="cat-field__label">{tx("Correção")}</span><input ref={inputRef as React.RefObject<HTMLInputElement>} className="cat-input" type={type} placeholder={item.kind === "date" ? tx("dd/MM/aaaa") : item.kind === "guardianName" ? tx("Nome do responsável") : tx("Digite o valor correto")} value={value} onChange={(e) => onChange(e.target.value)} /></label>;
}

const PREVIEW_COLUMNS: { key: string; label: string }[] = [
  { key: "row", label: "Linha" }, { key:"duplicateSource",label:"Origem" }, { key: "name", label: "Nome" }, { key: "birthDate", label: "Nascimento" }, { key: "probableGender", label: "Sexo" },
  { key: "bed", label: "Cama" }, { key: "bedroomPreference", label: "Preferência de quarto" }, { key: "team", label: "Time" },
  { key: "transportation", label: "Transporte" }, { key: "bedroom", label: "Quarto" }, { key: "caretakerId", label: "Líder" },
  { key: "cpf", label: "CPF" }, { key: "guardianCpf", label: "CPF do responsável" }, { key: "rg", label: "RG" },
  { key: "school", label: "Escola" }, { key: "schoolGrade", label: "Série" }, { key: "church", label: "Igreja" },
  { key: "invitedBy", label: "Convidado por" }, { key: "guardianName", label: "Responsável" }, { key: "guardianPhone", label: "Telefone" },
  { key: "guardianEmail", label: "E-mail" }, { key: "guardian2Name", label: "2º responsável" }, { key: "guardian2Phone", label: "Telefone do 2º" },
  { key: "emergencyContact", label: "Emergência" }, { key: "insurance", label: "Convênio" },
  { key: "insuranceCard", label: "Carteirinha" }, { key: "weightKg", label: "Peso" }, { key: "allergies", label: "Alergias" },
  { key: "drugAllergies", label: "Alergia a remédios" }, { key: "healthIssues", label: "Condições de saúde" }, { key: "neurodivergent", label: "Neurodivergente" },
  { key: "dailyMedicationText", label: "Medicação diária" }, { key: "foodRestrictionText", label: "Restrição alimentar" }, { key: "healthNotes", label: "Observações médicas" },
  { key: "generalNotes", label: "Observações" },
];

function PreviewTable({ record, delta, skippedRowNumbers, categories, declinedCategoryIds,duplicateChoice }: { record: CamperImport; delta: Delta; skippedRowNumbers: Set<number>; categories: Category[]; declinedCategoryIds: Set<string>;duplicateChoice:"update"|"keep"|"merge"|"" }) {
  const { tx } = useI18n();
  const labels = previewLabelMap(record, categories);
  const [expandedColumns, setExpandedColumns] = useState<Set<string>>(() => new Set());
  const toggleColumn = (key: string) => setExpandedColumns((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  // the table mirrors what will be written: ordered by room, then by kid, with
  // the rows that will not be imported at the bottom
  const rows = previewRows(record, delta, declinedCategoryIds,duplicateChoice).slice().sort((a, b) => {
    const outA = skippedRowNumbers.has(Number(a.row)) ? 1 : 0;
    const outB = skippedRowNumbers.has(Number(b.row)) ? 1 : 0;
    if (outA !== outB) return outA - outB;
    const roomA = displayPreviewValue("bedroom", a.bedroom, labels);
    const roomB = displayPreviewValue("bedroom", b.bedroom, labels);
    if (roomA !== roomB) return roomA === "—" ? 1 : roomB === "—" ? -1 : roomA.localeCompare(roomB, collatorLocale());
    return String(a.name ?? "").localeCompare(String(b.name ?? ""), collatorLocale());
  });
  const shown = rows.slice(0, 200);
  const columns = previewColumns(rows.filter((row) => !skippedRowNumbers.has(Number(row.row))), labels);
  const longColumns = new Set(columns.filter((column) => rows.some((row) => isLongPreviewValue(displayPreviewValue(column.key, row[column.key], labels)))).map((column) => column.key));
  return <div className="import-table-wrap"><table className="import-table"><thead><tr>{columns.map((column) => <th key={column.key} className={expandedColumns.has(column.key) ? "import-table__column--expanded" : undefined}>{longColumns.has(column.key) ? <button type="button" className={`import-table__column-toggle${expandedColumns.has(column.key) ? " is-expanded" : ""}`} aria-pressed={expandedColumns.has(column.key)} title={expandedColumns.has(column.key) ? tx("Recolher coluna") : tx("Mostrar o conteúdo completo desta coluna")} onClick={() => toggleColumn(column.key)}>{tx(column.label)} <span><EllipsisGlyph size={13} /></span></button> : tx(column.label)}</th>)}</tr></thead><tbody>{shown.map((r, i) => <tr key={`${r.row}-${i}`} className={skippedRowNumbers.has(Number(r.row)) ? "import-table__row--out" : undefined}>{columns.map((column) => { const cell = displayPreviewValue(column.key, r[column.key], labels, tx); const long = isLongPreviewValue(cell); const expanded = expandedColumns.has(column.key); return <td key={column.key} className={expanded ? "import-table__column--expanded" : undefined}>{long && !expanded ? <button type="button" className="import-table__truncated" title={tx("Mostrar o conteúdo completo desta coluna")} onClick={() => toggleColumn(column.key)}>{truncatePreviewValue(cell)}</button> : cell}</td>; })}</tr>)}</tbody></table>{rows.length > shown.length && <p className="cat-hint">{tx("Mostrando as primeiras {n} linhas.", { n: shown.length })}</p>}</div>;
}

const PREVIEW_TEXT_LIMIT = 56;
function isLongPreviewValue(value: string): boolean { return value.length > PREVIEW_TEXT_LIMIT; }
function truncatePreviewValue(value: string): string { return `...${value.slice(-(PREVIEW_TEXT_LIMIT - 3))}`; }

/** Hide fields that would be blank for every imported row. */
function previewColumns(rows: Record<string, unknown>[], labels: Map<string, string>) {
  return PREVIEW_COLUMNS.filter((column) => column.key === "row" || column.key === "name" || rows.some((row) => displayPreviewValue(column.key, row[column.key], labels) !== "—"));
}

function previewRows(record: CamperImport, delta: Delta, declinedCategoryIds: Set<string> = new Set(),duplicateChoice:"update"|"keep"|"merge"|""=""): Record<string, unknown>[] {
  const rows = record.preview.map((source) => {
    const row = { ...source };
    if (!declinedCategoryIds.size) return row;
    const notesById = row.categoryNotesById && typeof row.categoryNotesById === "object" ? row.categoryNotesById as Record<string, string[]> : {};
    const notes: string[] = [];
    if (typeof row.bed === "string" && declinedCategoryIds.has(row.bed)) { notes.push(...(notesById[row.bed] ?? [])); row.bed = null; }
    for (const field of ["allergies", "drugAllergies", "healthIssues"] as const) {
      const ids = Array.isArray(row[field]) ? row[field] as string[] : [];
      const removed = ids.filter((id) => declinedCategoryIds.has(id));
      row[field] = ids.filter((id) => !declinedCategoryIds.has(id));
      for (const id of removed) notes.push(...(notesById[id] ?? []));
    }
    if (notes.length) row.generalNotes = [String(row.generalNotes ?? "").trim(), ...new Set(notes)].filter(Boolean).join(" ");
    return row;
  });
  for (const review of record.reviews) {
    const change = delta[review.id];
    const value=change?.value||(review.kind==="duplicate"?duplicateChoice:"");
    if (change?.skip || !value) continue;
    const affected = new Set(review.affectedRows?.length ? review.affectedRows : [review.row]);
    for (const row of rows) if (affected.has(Number(row.row))) {
      if (review.kind === "leader") row.caretakerId = value;
      else if (review.kind === "date") row.birthDate = value;
      else if (review.kind === "guardianName") row.guardianName = value;
      else if (review.kind === "phone") row.guardianPhone = maskBrazilPhone(value);
      else if (review.kind === "cpf") row[review.field] = formatCpf(value);
      else if (review.kind === "email") row.guardianEmail = value.trim().toLowerCase();
      else if(review.kind==="duplicate"){row.duplicateChoice=value;row.duplicateSource=value==="keep"?"Cadastro atual":value==="update"?"Planilha":"Mesclado";if(value==="merge"&&review.mergedData)Object.assign(row,review.mergedData,{row:row.row,duplicateChoice:value,duplicateSource:"Mesclado"});else if(value==="keep"&&review.existingData)Object.assign(row,review.existingData,{row:row.row,duplicateChoice:value,duplicateSource:"Cadastro atual"});}
    }
  }
  for(const review of record.reviews)if(review.kind==="duplicate"){const row=rows.find((item)=>Number(item.row)===review.row);if(row&&!row.duplicateSource)row.duplicateSource="Pendente";}
  return rows;
}

function previewLabelMap(record: CamperImport, categories: Category[] = []): Map<string, string> {
  const labels = new Map<string, string>();
  for (const category of categories) for (const option of category.options) labels.set(option.id, option.label);
  for (const entry of record.dictionaries) if (typeof entry.value === "string" && entry.value) labels.set(entry.value, entry.label);
  for (const item of record.createdItems) labels.set(item.id, item.label);
  return labels;
}

function displayPreviewValue(key: string, value: unknown, labels: Map<string, string>, tx: (pt: string, vars?: Record<string, string | number>) => string = (s) => s): string {
  if (value == null || value === "") return "—";
  if (Array.isArray(value)) return value.map((v) => labels.get(String(v)) ?? String(v)).join(", ") || "—";
  if (typeof value === "boolean") return value ? tx("Sim") : tx("Não");
  const label = labels.get(String(value));
  if (label && !ID_RE.test(label)) return label;
  if (key === "birthDate" && /^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    const [year, month, day] = String(value).split("-");
    return `${day}/${month}/${year}`;
  }
  if (key === "probableGender") return value === "F" ? tx("Feminino") : value === "M" ? tx("Masculino") : "—";
  if (key === "duplicateSource") return tx(String(value));
  if (key === "guardianPhone" || key === "guardian2Phone") return formatBrazilPhoneClient(String(value));
  if (key === "weightKg") return tx("{weight} kg", { weight: String(value).replace(".", ",") });
  if (ID_RE.test(String(value))) return "—";
  return String(value);
}

function displayPreview(value: unknown, labels: Map<string, string>): string {
  return displayPreviewValue("", value, labels);
}
