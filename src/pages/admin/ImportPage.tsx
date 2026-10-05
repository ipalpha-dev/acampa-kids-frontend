import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiError } from "../../api/client";
import {
  IMPORT_MAX_BYTES,
  applyImport,
  cancelImport,
  createImport,
  fetchAppFields,
  fetchImport,
  fetchImportResults,
  isImportFile,
  patchImport,
  type AppField,
  type Decisions,
  type ImportAppField,
  type ImportReview,
  type ImportStep,
  type ImportSubject,
  type ImportView,
  type ResultBatch,
  type ResultStatus,
} from "../../api/imports";
import Breadcrumbs from "../../components/Breadcrumbs";
import { useConfirm } from "../../components/ConfirmDialog";
import OptionCards from "../../components/OptionCards";
import { peekPendingImportFile, setPendingImportFile, useFileDrop } from "../../hooks/useFileDrop";
import { ICONS } from "../../icons";
import { useI18n } from "../../i18n";
import { useRoute } from "../../router";
import { useNames } from "../../store/people";
import { IMPORT_BATCH_EVENT, IMPORT_PROGRESS_EVENT, type ImportBatchEvent, type ImportProgressEvent } from "../../store/realtime";
import styles from "./ImportPage.module.scss";

/**
 * Importar acampantes / equipe — through IPAlpha (CONTRACTS_ACAMPA §20 / §24).
 *
 *   pick (who + file) → IPAlpha reads it (live steps) → review (columns, people
 *   that look alike, Acampa's own fields, the required ones) → apply (live
 *   batches) → results per batch, with the Acampa fields each row still lacks.
 *
 * Only ids + Acampa field values come back; names are resolved on screen
 * (POST /api/people/names, paged by the people cache) and never stored.
 */

interface ImportPageProps {
  token: string;
  /** which list the page was opened from — the person may still switch before sending */
  subject: ImportSubject;
  /** where "Ver acampantes / equipe" and the breadcrumb lead (the setup wizard continues instead) */
  onDone?: () => void;
}

type Tx = (pt: string, vars?: Record<string, string | number>) => string;

/** the open import of each list, in memory only (an id — no person data): coming back to the page picks it up */
const remembered = new Map<ImportSubject, { token: string; id: string }>();

/** Tests: forget the open imports of this tab. */
export function forgetOpenImports(): void {
  remembered.clear();
}

/** Gentle labels for Acampa's own fields (the backend's description is the fallback). */
const APP_FIELD_LABEL: Record<string, string> = {
  transportation: "Transporte",
  bedroom: "Quarto",
  team: "Time",
  bedroomPreference: "Quer ficar com",
  invitedBy: "Convidado por",
  generalNotes: "Observações",
  roomRole: "Função no quarto",
};

/** IPAlpha's step names we know; anything else shows as it comes. */
const STEP_LABEL: Record<string, string> = {
  mapping: "Lendo as colunas da planilha",
  matching: "Procurando quem já tem cadastro",
  extracting: "Organizando as observações",
  applying: "Gravando no IPAlpha",
};

const RESULT_LABEL: Record<ResultStatus, string> = {
  created: "Cadastrado",
  updated: "Atualizado",
  skipped: "Não importado agora",
  failed: "Não deu certo",
};

const ACTIVE: ImportView["status"][] = ["analysing", "applying"];

function appFieldLabel(tx: Tx, field: Pick<AppField, "key" | "description">): string {
  const pt = APP_FIELD_LABEL[field.key];
  return pt ? tx(pt) : field.description || field.key;
}

function stepLabel(tx: Tx, name: string): string {
  const pt = STEP_LABEL[name];
  return pt ? tx(pt) : name;
}

function rowLabel(tx: Tx, rowRef: string): string {
  return /^\d+$/.test(rowRef) ? tx("Linha {row}", { row: rowRef }) : rowRef;
}

/** A friendly sentence for every refusal the import routes answer. */
export function importErrorMessage(tx: Tx, err: unknown): string {
  if (!(err instanceof ApiError)) return tx("Algo deu errado. Tente novamente.");
  switch (err.code) {
    case "OFFLINE":
      return tx("Sem conexão com o servidor. Verifique a internet e tente de novo.");
    case "FILE_REQUIRED":
      return tx("Escolha uma planilha para importar.");
    case "FILE_TOO_LARGE":
      return tx("A planilha passa de 5 MB. Divida em arquivos menores e importe um de cada vez.");
    case "FILE_TYPE_INVALID":
      return tx("Use uma planilha .xlsx ou .csv.");
    case "SUBJECT_INVALID":
      return tx("Escolha se a planilha é de acampantes ou da equipe.");
    case "COORDINATION_REQUIRED":
      return tx("A importação é feita pela coordenação.");
    case "EDITION_UNKNOWN":
      return tx("Este acampamento ainda não está ligado a uma edição no IPAlpha. Fale com quem cuida do IPAlpha.");
    case "DECISIONS_INVALID":
      return tx("Essa escolha não pôde ser guardada. Confira e tente de novo.");
    case "IPALPHA_UNAVAILABLE":
      return tx("O IPAlpha está em manutenção agora. Tente de novo daqui a pouco.");
    case "CORE_REJECTED":
      if (err.reason === "decisionsPending") return tx("Ainda falta decidir o que fazer com alguns campos obrigatórios.");
      return tx("O IPAlpha não aceitou esta etapa da importação agora.");
    case "CORE_FORBIDDEN":
      return tx("O IPAlpha não permitiu esta importação para o seu perfil.");
    default:
      return err.message || tx("Algo deu errado. Tente novamente.");
  }
}

export default function ImportPage({ token, subject: initialSubject, onDone }: ImportPageProps) {
  const { tx } = useI18n();
  const { navigate } = useRoute();
  const confirm = useConfirm();
  const [subject, setSubject] = useState<ImportSubject>(initialSubject);
  const [file, setFile] = useState<File | null>(() => peekPendingImportFile());
  const [preview, setPreview] = useState<AppField[]>([]);
  const [view, setView] = useState<ImportView | null>(null);
  const [busy, setBusy] = useState<"upload" | "apply" | "cancel" | null>(null);
  const [saving, setSaving] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ResultBatch[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  /** PATCHes go one after the other so a later choice never lands before an earlier one */
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const listLabel = subject === "camper" ? tx("Acampantes") : tx("Equipe");
  const leave = useCallback(() => (onDone ? onDone() : navigate(initialSubject === "camper" ? "/campers" : "/staff")), [onDone, navigate, initialSubject]);

  // the dropped file was handed over once: forget it so a later visit starts clean
  useEffect(() => {
    if (peekPendingImportFile()) setPendingImportFile(null);
  }, []);

  // what Acampa will ask about for this list (shown before the upload)
  useEffect(() => {
    let alive = true;
    fetchAppFields(token, subject)
      .then((fields) => alive && setPreview(fields))
      .catch(() => alive && setPreview([]));
    return () => {
      alive = false;
    };
  }, [token, subject]);

  // an import of this list still open in this tab: pick it back up
  useEffect(() => {
    const open = remembered.get(initialSubject);
    if (!open || open.token !== token) return;
    let alive = true;
    fetchImport(token, open.id)
      .then((v) => alive && setView(v))
      .catch(() => remembered.delete(initialSubject));
    return () => {
      alive = false;
    };
  }, [token, initialSubject]);

  const refresh = useCallback(async () => {
    const id = viewRef.current?.id;
    if (!id) return;
    try {
      const next = await fetchImport(token, id);
      if (viewRef.current?.id === id) setView(next);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) remembered.delete(initialSubject);
    }
  }, [token, initialSubject]);

  const loadResults = useCallback(async () => {
    const id = viewRef.current?.id;
    if (!id) return;
    try {
      const page = await fetchImportResults(token, id);
      if (viewRef.current?.id !== id) return;
      setResults(page.items);
      setNextCursor(page.nextCursor);
    } catch {
      // the summary still shows; the rows come with the next batch / refresh
    }
  }, [token]);

  // live: IPAlpha's progress + each applied batch (only the importer's sockets hear these)
  useEffect(() => {
    if (!view) return;
    const id = view.id;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const soon = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        void refresh();
      }, 400);
    };
    const onProgress = (e: Event) => {
      const d = (e as CustomEvent<ImportProgressEvent>).detail;
      if (!d || d.importId !== id) return;
      // steps move right away; a new stage (review / done…) waits for the re-read, which brings its data
      setView((v) => (v && v.id === id ? { ...v, steps: mergeStep(v.steps, d), status: ACTIVE.includes(v.status) && isStatus(d.status) && ACTIVE.includes(d.status) ? d.status : v.status } : v));
      soon();
    };
    const onBatch = (e: Event) => {
      const d = (e as CustomEvent<ImportBatchEvent>).detail;
      if (!d || d.importId !== id) return;
      soon();
      void loadResults();
    };
    window.addEventListener(IMPORT_PROGRESS_EVENT, onProgress);
    window.addEventListener(IMPORT_BATCH_EVENT, onBatch);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener(IMPORT_PROGRESS_EVENT, onProgress);
      window.removeEventListener(IMPORT_BATCH_EVENT, onBatch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.id, refresh, loadResults]);

  // a quiet safety net while IPAlpha works: the socket may be reconnecting
  const status = view?.status ?? null;
  useEffect(() => {
    if (!status || !ACTIVE.includes(status)) return;
    const timer = setInterval(() => void refresh(), 8000);
    return () => clearInterval(timer);
  }, [status, refresh]);

  // results: from the first batch on, and once more when it is over
  useEffect(() => {
    if (status === "applying" || status === "done") void loadResults();
  }, [status, loadResults]);

  function pickFile(f: File) {
    setError(null);
    if (!isImportFile(f)) return setError(tx("Use uma planilha .xlsx ou .csv."));
    if (f.size > IMPORT_MAX_BYTES) return setError(tx("A planilha passa de 5 MB. Divida em arquivos menores e importe um de cada vez."));
    setFile(f);
  }
  const { dragging, handlers } = useFileDrop(pickFile, isImportFile);

  async function upload() {
    if (!file || busy) return;
    setBusy("upload");
    setError(null);
    try {
      const created = await createImport(token, subject, file);
      remembered.set(initialSubject, { token, id: created.id });
      setResults([]);
      setNextCursor(null);
      setView(created);
    } catch (err) {
      setError(importErrorMessage(tx, err));
    } finally {
      setBusy(null);
    }
  }

  function decide(d: Decisions) {
    const id = viewRef.current?.id;
    if (!id) return;
    setError(null);
    setSaving((n) => n + 1);
    queue.current = queue.current
      .then(async () => {
        const next = await patchImport(token, id, d);
        if (viewRef.current?.id === id) setView(next);
      })
      .catch((err) => setError(importErrorMessage(tx, err)))
      .finally(() => setSaving((n) => n - 1));
  }

  async function apply() {
    const v = viewRef.current;
    if (!v || busy || v.pendingRequired.length > 0) return;
    setBusy("apply");
    setError(null);
    try {
      await queue.current;
      setView(await applyImport(token, v.id));
    } catch (err) {
      setError(importErrorMessage(tx, err));
      void refresh();
    } finally {
      setBusy(null);
    }
  }

  async function cancel() {
    const v = viewRef.current;
    if (!v || busy) return;
    const ok = await confirm({
      emoji: "🧹",
      title: tx("Cancelar esta importação?"),
      message: tx("As linhas da planilha são apagadas do IPAlpha. Nenhum cadastro é alterado."),
      confirmLabel: tx("Cancelar importação"),
      cancelLabel: tx("Continuar importando"),
      danger: true,
    });
    if (!ok) return;
    setBusy("cancel");
    setError(null);
    try {
      await cancelImport(token, v.id);
      startOver();
    } catch (err) {
      setError(importErrorMessage(tx, err));
    } finally {
      setBusy(null);
    }
  }

  function startOver() {
    remembered.delete(initialSubject);
    setView(null);
    setFile(null);
    setResults([]);
    setNextCursor(null);
    setError(null);
  }

  async function loadMore() {
    const id = view?.id;
    if (!id || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchImportResults(token, id, nextCursor);
      setResults((prev) => [...prev, ...page.items.filter((b) => !prev.some((p) => p.batch === b.batch))]);
      setNextCursor(page.nextCursor);
    } catch (err) {
      setError(importErrorMessage(tx, err));
    } finally {
      setLoadingMore(false);
    }
  }

  const stage: "pick" | ImportView["status"] = view ? view.status : "pick";
  const title = subject === "camper" ? tx("Importar acampantes") : tx("Importar equipe");

  return (
    <div className="admin-page">
      <Breadcrumbs items={[{ label: initialSubject === "camper" ? tx("Acampantes") : tx("Equipe"), onClick: leave }, { label: tx("Importar") }]} />
      <header className="admin-head">
        <h1 className="admin-title">
          <img className="admin-title__icon" src={subject === "camper" ? ICONS.importCampers : ICONS.staffPair} alt="" aria-hidden="true" /> {title}
        </h1>
      </header>

      <Reveal open={!!error}>
        <p className="message message--error" role="alert">
          {error}
        </p>
      </Reveal>

      <div key={stage} className={styles.stage}>
        {stage === "pick" && (
          <section className="cat-form" {...handlers}>
            <OptionCards
              row
              label={tx("O que tem na planilha?")}
              value={subject}
              disabled={busy === "upload"}
              onChange={(s) => setSubject(s)}
              options={[
                { key: "camper", icon: ICONS.importCampers, title: tx("Acampantes") },
                { key: "team", icon: ICONS.staffPair, title: tx("Equipe") },
              ]}
            />
            <div className={`${styles.drop} ${dragging ? styles.dropOn : ""}`}>
              <p className={styles.dropTitle}>{file ? file.name : tx("Arraste a planilha para cá ou escolha o arquivo")}</p>
              <p className="cat-hint">{file ? tx("{size} · pronto para enviar", { size: sizeLabel(file.size) }) : tx(".xlsx ou .csv, até 5 MB")}</p>
              <input
                ref={fileInput}
                className={styles.fileInput}
                type="file"
                accept=".csv,.xlsx"
                aria-label={tx("Escolher planilha")}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) pickFile(f);
                  e.target.value = "";
                }}
              />
              <button type="button" className="button button--secondary" onClick={() => fileInput.current?.click()} disabled={busy === "upload"}>
                {file ? tx("Trocar arquivo") : tx("Escolher arquivo")}
              </button>
            </div>
            {preview.length > 0 && (
              <div className={styles.preview}>
                <p className="cat-hint">{tx("Além dos dados da pessoa, o Acampa Kids aproveita estas colunas, se existirem:")}</p>
                <ul className={styles.chips}>
                  {preview.map((f) => (
                    <li key={f.key} className={styles.chip}>
                      {appFieldLabel(tx, f)}
                      {f.required && <span className={styles.requiredTag}> · {tx("obrigatório")}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="cat-hint">{tx("O IPAlpha lê a planilha, encontra quem já tem cadastro e prepara tudo. Nada é gravado antes de você conferir.")}</p>
            <div className="cat-form__actions">
              <button type="button" className="button button--secondary" onClick={leave}>
                {tx("Voltar")}
              </button>
              <button type="button" className="button button--primary" disabled={!file || busy === "upload"} onClick={() => void upload()}>
                {busy === "upload" ? tx("Enviando…") : tx("Enviar planilha")}
              </button>
            </div>
          </section>
        )}

        {view && stage === "analysing" && (
          <section className="cat-form" aria-live="polite">
            <h2 className="cat-form__title">{tx("O IPAlpha está lendo a planilha…")}</h2>
            {view.file && <p className="cat-hint">{view.file.name}</p>}
            <Steps steps={view.steps} />
            <div className="cat-form__actions">
              <button type="button" className="button button--secondary" disabled={!!busy} onClick={() => void cancel()}>
                {busy === "cancel" ? tx("Cancelando…") : tx("Cancelar importação")}
              </button>
            </div>
          </section>
        )}

        {view && stage === "review" && (
          <ReviewStage view={view} saving={saving > 0} busy={busy} onDecide={decide} onApply={() => void apply()} onCancel={() => void cancel()} />
        )}

        {view && (stage === "applying" || stage === "done") && (
          <section className="cat-form" aria-live="polite">
            <h2 className="cat-form__title">{stage === "applying" ? tx("Gravando no IPAlpha…") : tx("Importação concluída 🎉")}</h2>
            {stage === "applying" && <Steps steps={view.steps} />}
            <Summary view={view} />
            {stage === "done" && (
              <div className="cat-form__actions">
                <button type="button" className="button button--secondary" onClick={startOver}>
                  {tx("Nova importação")}
                </button>
                <button type="button" className="button button--primary" onClick={leave}>
                  {initialSubject === "camper" ? tx("Ver acampantes") : tx("Ver equipe")}
                </button>
              </div>
            )}
          </section>
        )}

        {view && (stage === "failed" || stage === "cancelled") && (
          <section className="cat-form">
            <h2 className="cat-form__title">{stage === "failed" ? tx("Não foi possível terminar esta importação") : tx("Importação cancelada")}</h2>
            <p className="cat-hint">
              {stage === "failed"
                ? tx("O IPAlpha não conseguiu concluir. O que já foi gravado continua salvo — você pode enviar a planilha de novo.")
                : tx("As linhas da planilha foram apagadas do IPAlpha.")}
            </p>
            {view.applied.rows > 0 && <Summary view={view} />}
            <div className="cat-form__actions">
              <button type="button" className="button button--primary" onClick={startOver}>
                {tx("Começar de novo")}
              </button>
            </div>
          </section>
        )}
      </div>

      {view && results.length > 0 && <Results batches={results} appFields={view.appFields} listLabel={listLabel} hasMore={!!nextCursor} loadingMore={loadingMore} onMore={() => void loadMore()} />}
    </div>
  );
}

function isStatus(s: string): s is ImportView["status"] {
  return ["analysing", "review", "applying", "done", "failed", "cancelled"].includes(s);
}

function mergeStep(steps: ImportStep[], d: ImportProgressEvent): ImportStep[] {
  const i = steps.findIndex((s) => s.name === d.step);
  const next = { name: d.step, done: d.done, total: d.total };
  if (i < 0) return [...steps, next];
  const out = steps.slice();
  out[i] = next;
  return out;
}

function sizeLabel(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

// ── pieces ──────────────────────────────────────────────────────────────────

/** Grows / shrinks with its real height (0fr ↔ 1fr) instead of jumping. */
function Reveal({ open, children }: { open: boolean; children: ReactNode }) {
  // keeps the last content while closing, so it shrinks away instead of vanishing first
  const last = useRef<ReactNode>(children);
  if (open) last.current = children;
  return (
    <div className={`${styles.reveal} ${open ? styles.revealOpen : ""}`} aria-hidden={open ? undefined : true}>
      <div className={styles.revealInner}>{last.current}</div>
    </div>
  );
}

function Steps({ steps }: { steps: ImportStep[] }) {
  const { tx } = useI18n();
  if (steps.length === 0) return <p className="cat-hint">{tx("Começando…")}</p>;
  return (
    <ol className={styles.steps}>
      {steps.map((s) => {
        const pct = s.total > 0 ? Math.min(100, Math.round((s.done / s.total) * 100)) : 0;
        const finished = s.total > 0 && s.done >= s.total;
        return (
          <li key={s.name} className={`${styles.step} ${finished ? styles.stepDone : ""}`}>
            <span className={styles.stepName}>
              {finished ? "✅ " : ""}
              {stepLabel(tx, s.name)}
            </span>
            <span className={styles.stepCount}>{s.total > 0 ? `${s.done}/${s.total}` : "…"}</span>
            <span className={styles.bar} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={stepLabel(tx, s.name)}>
              {/* the only inline value: the step's live percentage */}
              <span className={styles.barFill} style={{ width: `${pct}%` }} />
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Summary({ view }: { view: ImportView }) {
  const { tx } = useI18n();
  const c = view.counts;
  return (
    <div className={styles.summary}>
      <p className="cat-hint">{tx("{applied} de {rows} linha(s) processadas", { applied: view.applied.rows, rows: c.rows })}</p>
      <ul className={styles.chips}>
        <li className={`${styles.chip} ${styles.chipCreated}`}>{tx("{n} cadastrado(s)", { n: c.created })}</li>
        <li className={`${styles.chip} ${styles.chipUpdated}`}>{tx("{n} atualizado(s)", { n: c.updated })}</li>
        {c.skipped > 0 && <li className={`${styles.chip} ${styles.chipSkipped}`}>{tx("{n} não importado(s) agora", { n: c.skipped })}</li>}
        {c.failed > 0 && <li className={`${styles.chip} ${styles.chipFailed}`}>{tx("{n} não deu certo", { n: c.failed })}</li>}
      </ul>
    </div>
  );
}

/** A collapsible block of the review; the body animates its height. */
function Section({ title, badge, defaultOpen, children }: { title: string; badge?: ReactNode; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <section className={styles.section}>
      <button type="button" className={styles.sectionHead} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className={`${styles.caret} ${open ? styles.caretOpen : ""}`} aria-hidden="true">
          ›
        </span>
        <span className={styles.sectionTitle}>{title}</span>
        {badge}
      </button>
      <div className={`${styles.reveal} ${open ? styles.revealOpen : ""}`}>
        <div className={styles.revealInner}>
          <div className={styles.sectionBody}>{children}</div>
        </div>
      </div>
    </section>
  );
}

interface ReviewStageProps {
  view: ImportView;
  saving: boolean;
  busy: "upload" | "apply" | "cancel" | null;
  onDecide: (d: Decisions) => void;
  onApply: () => void;
  onCancel: () => void;
}

function ReviewStage({ view, saving, busy, onDecide, onApply, onCancel }: ReviewStageProps) {
  const { tx } = useI18n();
  const columns = Object.keys(view.mapping);
  const required = view.appFields.filter((f) => f.required && (f.emptyRows > 0 || view.pendingRequired.includes(f.key)));
  const withCategories = view.appFields.filter((f) => f.kind === "category" && Object.keys(f.categoryMapping).length > 0);
  const pending = view.pendingRequired;
  const openReviews = view.reviews.filter((r) => !r.choice).length;
  const candidateIds = useMemo(() => view.reviews.flatMap((r) => r.candidates.map((c) => c.personId)), [view.reviews]);
  const nameOf = useNames(candidateIds);
  const pendingLabels = pending.map((key) => {
    const f = view.appFields.find((a) => a.key === key);
    return f ? appFieldLabel(tx, f) : key;
  });

  return (
    <section className="cat-form">
      <h2 className="cat-form__title">{tx("Confira antes de gravar")}</h2>
      <p className="cat-hint">
        {view.file ? `${view.file.name} · ` : ""}
        {tx("{n} linha(s) na planilha", { n: view.counts.rows })}
      </p>

      {required.length > 0 && (
        <Section title={tx("Campos obrigatórios em branco")} badge={pending.length > 0 ? <span className={styles.badgeWarn}>{pending.length}</span> : <span className={styles.badgeOk}>✓</span>} defaultOpen>
          {required.map((f) => (
            <RequiredDecisionField key={f.key} field={f} pending={pending.includes(f.key)} onDecide={onDecide} />
          ))}
        </Section>
      )}

      {view.reviews.length > 0 && (
        <Section title={tx("Pessoas para conferir")} badge={openReviews > 0 ? <span className={styles.badgeWarn}>{openReviews}</span> : <span className={styles.badgeOk}>✓</span>} defaultOpen>
          <ul className={styles.reviews}>
            {view.reviews.map((r) => (
              <ReviewItem key={r.id} review={r} nameOf={nameOf} onDecide={onDecide} />
            ))}
          </ul>
        </Section>
      )}

      {withCategories.length > 0 && (
        <Section title={tx("Valores da planilha → opções do Acampa")}>
          {withCategories.map((f) => (
            <div key={f.key} className={styles.group}>
              <h3 className={styles.groupTitle}>{appFieldLabel(tx, f)}</h3>
              <ul className={styles.pairs}>
                {Object.entries(f.categoryMapping).map(([value, key]) => (
                  <li key={value} className={styles.pair}>
                    <span className={styles.pairFrom}>{value || tx("(vazio)")}</span>
                    <span aria-hidden="true">→</span>
                    <select
                      className="cat-input"
                      aria-label={tx("{field}: {value}", { field: appFieldLabel(tx, f), value: value || tx("(vazio)") })}
                      value={key ?? ""}
                      onChange={(e) => onDecide({ categories: { [f.key]: { [value]: e.target.value || null } } })}
                    >
                      <option value="">{tx("Deixar em branco")}</option>
                      {(f.categories ?? []).map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Section>
      )}

      {columns.length > 0 && (
        <Section title={tx("Colunas da planilha")} badge={<span className={styles.badgeNeutral}>{columns.length}</span>}>
          <ul className={styles.pairs}>
            {columns.map((col) => (
              <li key={col} className={styles.pair}>
                <span className={styles.pairFrom}>{col}</span>
                <span aria-hidden="true">→</span>
                {view.fields.length > 0 ? (
                  <select className="cat-input" aria-label={tx("Coluna {column}", { column: col })} value={view.mapping[col] ?? ""} onChange={(e) => onDecide({ mapping: { [col]: e.target.value || null } })}>
                    <option value="">{tx("Não importar esta coluna")}</option>
                    {view.fields.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className={styles.pairTo}>{view.mapping[col] ?? tx("não importada")}</span>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Reveal open={pending.length > 0}>
        <p className={styles.pendingNote}>{tx("Para gravar, decida o que fazer com: {fields}.", { fields: pendingLabels.join(", ") })}</p>
      </Reveal>

      <div className="cat-form__actions">
        {saving && <span className="cat-hint">{tx("Guardando sua escolha…")}</span>}
        <button type="button" className="button button--secondary" disabled={!!busy} onClick={onCancel}>
          {busy === "cancel" ? tx("Cancelando…") : tx("Cancelar importação")}
        </button>
        <button type="button" className="button button--primary" disabled={pending.length > 0 || !!busy || saving} onClick={onApply}>
          {busy === "apply" ? tx("Gravando…") : tx("Gravar no IPAlpha")}
        </button>
      </div>
    </section>
  );
}

function RequiredDecisionField({ field, pending, onDecide }: { field: ImportAppField; pending: boolean; onDecide: (d: Decisions) => void }) {
  const { tx } = useI18n();
  const label = appFieldLabel(tx, field);
  const decision = field.decision;
  const [mode, setMode] = useState<"default" | "skip" | null>(decision?.mode ?? null);
  const [text, setText] = useState(decision?.mode === "default" ? decision.value : "");
  useEffect(() => {
    setMode(field.decision?.mode ?? null);
    if (field.decision?.mode === "default") setText(field.decision.value);
  }, [field.decision]);
  const categoryValue = decision?.mode === "default" ? decision.value : "";

  return (
    <fieldset className={`${styles.required} ${pending ? styles.requiredPending : ""}`}>
      <legend className={styles.requiredTitle}>
        {tx("{field}: {n} linha(s) sem valor", { field: label, n: field.emptyRows })}
      </legend>
      <div className={styles.choices} role="radiogroup" aria-label={label}>
        <button type="button" role="radio" aria-checked={mode === "default"} className={`${styles.choice} ${mode === "default" ? styles.choiceOn : ""}`} onClick={() => setMode("default")}>
          {tx("Usar um valor para todas as linhas vazias")}
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={mode === "skip"}
          className={`${styles.choice} ${mode === "skip" ? styles.choiceOn : ""}`}
          onClick={() => {
            setMode("skip");
            onDecide({ required: { [field.key]: { mode: "skip" } } });
          }}
        >
          {tx("Não importar essas linhas agora")}
        </button>
      </div>
      <Reveal open={mode === "default"}>
        <div className={styles.defaultRow}>
          {field.kind === "category" ? (
            <select
              className="cat-input"
              aria-label={tx("Valor para as linhas vazias de {field}", { field: label })}
              value={categoryValue}
              onChange={(e) => e.target.value && onDecide({ required: { [field.key]: { mode: "default", value: e.target.value } } })}
            >
              <option value="">{tx("Escolha…")}</option>
              {(field.categories ?? []).map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          ) : (
            <>
              <input className="cat-input" aria-label={tx("Valor para as linhas vazias de {field}", { field: label })} value={text} onChange={(e) => setText(e.target.value)} />
              <button type="button" className="button button--secondary" disabled={!text.trim()} onClick={() => onDecide({ required: { [field.key]: { mode: "default", value: text.trim() } } })}>
                {tx("Usar este valor")}
              </button>
            </>
          )}
        </div>
      </Reveal>
    </fieldset>
  );
}

function ReviewItem({ review: r, nameOf, onDecide }: { review: ImportReview; nameOf: (id: string | null | undefined) => string; onDecide: (d: Decisions) => void }) {
  const { tx } = useI18n();
  return (
    <li className={`${styles.review} ${r.choice ? styles.reviewDone : ""}`}>
      <p className={styles.reviewHead}>
        <strong>{rowLabel(tx, r.rowRef)}</strong> · {r.message}
      </p>
      <div className={styles.choices}>
        {r.candidates.map((c) => {
          const on = r.choice === "match" && r.personId === c.personId;
          return (
            <button key={c.personId} type="button" aria-pressed={on} className={`${styles.choice} ${on ? styles.choiceOn : ""}`} onClick={() => onDecide({ reviews: { [r.id]: { choice: "match", personId: c.personId } } })}>
              {tx("É {name}", { name: nameOf(c.personId) || tx("esta pessoa") })}
            </button>
          );
        })}
        <button type="button" aria-pressed={r.choice === "new"} className={`${styles.choice} ${r.choice === "new" ? styles.choiceOn : ""}`} onClick={() => onDecide({ reviews: { [r.id]: { choice: "new" } } })}>
          {tx("Cadastrar como nova pessoa")}
        </button>
        <button type="button" aria-pressed={r.choice === "skip"} className={`${styles.choice} ${r.choice === "skip" ? styles.choiceOn : ""}`} onClick={() => onDecide({ reviews: { [r.id]: { choice: "skip" } } })}>
          {tx("Não importar agora")}
        </button>
      </div>
    </li>
  );
}

function Results({ batches, appFields, listLabel, hasMore, loadingMore, onMore }: { batches: ResultBatch[]; appFields: ImportAppField[]; listLabel: string; hasMore: boolean; loadingMore: boolean; onMore: () => void }) {
  const { tx } = useI18n();
  const ids = useMemo(() => batches.flatMap((b) => b.rows.map((r) => r.personId).filter((id): id is string => !!id)), [batches]);
  const nameOf = useNames(ids);
  const labelOf = (key: string) => {
    const f = appFields.find((a) => a.key === key);
    return f ? appFieldLabel(tx, f) : APP_FIELD_LABEL[key] ? tx(APP_FIELD_LABEL[key]) : key;
  };
  const sorted = [...batches].sort((a, b) => a.batch - b.batch);

  return (
    <section className="cat-form" aria-label={tx("Resultado da importação")}>
      <h2 className="cat-form__title">{tx("Resultado por lote")}</h2>
      <p className="cat-hint">{tx("Os campos em branco podem ser completados depois, em {list}.", { list: listLabel })}</p>
      {sorted.map((b) => (
        <div key={b.batch} className={styles.batch}>
          <h3 className={styles.groupTitle}>{tx("Lote {n}", { n: b.batch })}</h3>
          <ul className={styles.rows}>
            {b.rows.map((row) => (
              <li key={`${b.batch}:${row.rowRef}`} className={styles.row}>
                <span className={styles.rowName}>{(row.personId && nameOf(row.personId)) || rowLabel(tx, row.rowRef)}</span>
                <span className={`${styles.status} ${styles[`status_${row.status}`] ?? ""}`}>{tx(RESULT_LABEL[row.status] ?? row.status)}</span>
                {row.reason && <span className={styles.reason}>{row.reason}</span>}
                {row.unfilled.length > 0 && <span className={styles.unfilled}>{tx("Ficou sem: {fields}", { fields: row.unfilled.map(labelOf).join(", ") })}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {hasMore && (
        <div className="cat-form__actions">
          <button type="button" className="button button--secondary" disabled={loadingMore} onClick={onMore}>
            {loadingMore ? tx("Carregando…") : tx("Ver mais lotes")}
          </button>
        </div>
      )}
    </section>
  );
}
