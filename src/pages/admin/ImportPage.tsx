import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiError } from "../../api/client";
import {
  APP_FIELD_LABEL,
  APP_FIELD_PREFIX,
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
 *   pick (who + file) → IPAlpha reads it (live steps) → review (the questions
 *   IPAlpha asks: missing columns, people that look alike, values to fix,
 *   Acampa's own fields, observations, required fields) → apply (live
 *   batches) → results per batch, with the Acampa fields each row still lacks.
 *
 * Only ids + Acampa field values come back; names are resolved on screen
 * (POST /api/people/names, paged by the people cache) and never stored. The
 * row names in the questions come from the file itself (the importer's own
 * view, never kept).
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

/** The person fields IPAlpha maps a column to (persons-api CORE_FIELDS). */
const CORE_FIELD_LABEL: Record<string, string> = {
  name: "Nome",
  nickname: "Apelido",
  birthDate: "Data de nascimento",
  sex: "Sexo",
  homeChurch: "Igreja que frequenta",
  phone: "Celular",
  email: "E-mail",
  cpf: "CPF",
  rg: "RG",
  school: "Escola",
  schoolGrade: "Série",
  emergencyContact: "Contato de emergência",
  insurance: "Convênio médico",
  insuranceCard: "Carteirinha",
  weightKg: "Peso",
  allergies: "Alergias",
  drugAllergies: "Alergia a medicamentos",
  healthIssues: "Condições de saúde",
  neurodivergent: "Neurodivergência",
  dailyMedication: "Medicação de uso diário",
  foodRestrictions: "Restrição alimentar",
  healthNotes: "Observações de saúde",
  observations: "Observações gerais da planilha",
  responsibleName: "Nome do responsável",
  responsiblePhone: "Celular do responsável",
  responsibleEmail: "E-mail do responsável",
  responsibleCpf: "CPF do responsável",
  responsible2Name: "Nome do 2º responsável",
  responsible2Phone: "Celular do 2º responsável",
  rowKind: "Tipo de linha",
};

/** IPAlpha's steps (persons-api); anything else shows as it comes. */
const STEP_LABEL: Record<string, string> = {
  read: "Lendo a planilha",
  columns: "Entendendo as colunas",
  matching: "Procurando quem já tem cadastro",
  categories: "Ligando os valores às opções do Acampa",
  observations: "Organizando as observações",
  apply: "Gravando no IPAlpha",
};

const RESULT_LABEL: Record<ResultStatus, string> = {
  created: "Cadastrado",
  updated: "Atualizado",
  skipped: "Não importado agora",
  failed: "Não deu certo",
};

/** persons-api's row reasons, said gently (anything unknown → a generic line). */
const REASON_LABEL: Record<string, string> = {
  skippedByReview: "Você escolheu não importar esta linha agora.",
  requiredFieldSkipped: "Ficou para depois: um campo obrigatório estava em branco.",
  pendingDecision: "Faltou uma decisão para esta linha.",
  unknownRowKind: "Não deu para saber o tipo desta linha.",
  cannotLinkSelf: "Quem importa não pode ser o responsável nesta mesma importação.",
};

const WHO_LABEL: Record<string, string> = { responsible: "Responsável", responsible2: "2º responsável" };

const ACTIVE: ImportView["status"][] = ["analysing", "applying"];

function appFieldLabel(tx: Tx, field: Pick<AppField, "key" | "description">): string {
  const pt = APP_FIELD_LABEL[field.key];
  return pt ? tx(pt) : field.description || field.key;
}

/** A core field key or `app:<key>` → its label. */
function fieldLabel(tx: Tx, key: string | null, appFields: AppField[]): string {
  if (!key) return "";
  if (key.startsWith(APP_FIELD_PREFIX)) {
    const k = key.slice(APP_FIELD_PREFIX.length);
    const f = appFields.find((a) => a.key === k);
    return f ? appFieldLabel(tx, f) : APP_FIELD_LABEL[k] ? tx(APP_FIELD_LABEL[k]) : k;
  }
  return CORE_FIELD_LABEL[key] ? tx(CORE_FIELD_LABEL[key]) : key;
}

function stepLabel(tx: Tx, name: string): string {
  const pt = STEP_LABEL[name];
  return pt ? tx(pt) : name;
}

function rowLabel(tx: Tx, rowRef: string | number | null): string {
  if (rowRef === null) return "";
  return /^\d+$/.test(String(rowRef)) ? tx("Linha {row}", { row: rowRef }) : String(rowRef);
}

/** projects-api refused this person's place in the camp (decision 81: a person this row created was undone in IPAlpha) */
const MEMBERSHIP_PREFIX = "membership:";

export function reasonLabel(tx: Tx, reason: string): string {
  const parts = reason.split(",").map((p) => p.trim());
  for (const part of parts) {
    const pt = REASON_LABEL[part];
    if (pt) return tx(pt);
  }
  if (parts.some((p) => p.startsWith(MEMBERSHIP_PREFIX))) return tx("O IPAlpha não aceitou a inscrição desta pessoa no acampamento.");
  return tx("Não deu certo desta vez.");
}

/** persons-api stops a run when the importer may no longer register (decision 75: projects-api re-checks live). */
const IMPORTER_REFUSALS = new Set(["roleNotHeld", "notSteward", "editionMismatch", "noGrant", "outsideWindow"]);
const RESUMABLE_FAILURES = new Set(["projectsUnavailable", "interrupted", "internalError"]);

/** Why a run stopped (persons-api `failureReason`) and whether applying again continues it. */
export function failureOf(tx: Tx, reason: string | null): { text: string; resumable: boolean } {
  if (!reason || reason === "analysisFailed") return { text: tx("O IPAlpha não conseguiu ler esta planilha. Confira o arquivo e envie de novo."), resumable: false };
  if (RESUMABLE_FAILURES.has(reason)) return { text: tx("O IPAlpha parou no meio da gravação. O que já foi gravado continua salvo — grave de novo para continuar de onde parou."), resumable: true };
  if (reason.startsWith(MEMBERSHIP_PREFIX)) {
    const why = reason.slice(MEMBERSHIP_PREFIX.length);
    if (why === "outsideWindow") return { text: tx("O período de inscrições desta edição está fechado no IPAlpha, então a gravação parou. O que já foi gravado continua salvo — quando o período abrir, grave de novo para continuar."), resumable: true };
    if (IMPORTER_REFUSALS.has(why)) return { text: tx("Seu perfil no IPAlpha não pode mais inscrever pessoas nesta edição, então a gravação parou. O que já foi gravado continua salvo — confira seu acesso com a coordenação e grave de novo."), resumable: true };
    return { text: tx("O IPAlpha não aceitou mais inscrições nesta edição do acampamento. O que já foi gravado continua salvo. Fale com quem cuida do IPAlpha."), resumable: false };
  }
  return { text: tx("O IPAlpha não conseguiu terminar esta importação. O que já foi gravado continua salvo. Fale com quem cuida do IPAlpha."), resumable: false };
}

/** A friendly sentence for every refusal the import routes answer. */
export function importErrorMessage(tx: Tx, err: unknown, te: (err: unknown, fallbackPt?: string) => string): string {
  if (!(err instanceof ApiError)) return te(err);
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
    case "DECISIONS_PENDING":
      return tx("Ainda há perguntas para responder antes de gravar.");
    case "IPALPHA_UNAVAILABLE":
      return tx("O IPAlpha está em manutenção agora. Tente de novo daqui a pouco.");
    case "CORE_REJECTED":
      if (err.reason === "importBusy") return tx("O IPAlpha ainda está trabalhando nesta planilha. Espere um instante.");
      return tx("O IPAlpha não aceitou esta etapa da importação agora.");
    case "CORE_FORBIDDEN":
      if (err.reason === "notImportOwner") return tx("Só quem começou esta importação pode continuá-la.");
      return tx("O IPAlpha não permitiu esta importação para o seu perfil.");
    default:
      // any other refusal: by code / translated message (i18n/errors.ts)
      return te(err);
  }
}

export default function ImportPage({ token, subject: initialSubject, onDone }: ImportPageProps) {
  const { tx, te } = useI18n();
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
  /** import values kept aside because someone changed the field by hand (decision 78) */
  const [conflicts, setConflicts] = useState(0);
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
      if (d.conflicts > 0) setConflicts((n) => n + d.conflicts);
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
    if (status === "applying" || status === "done" || status === "failed" || status === "cancelled") void loadResults();
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
      setConflicts(0);
      setView(created);
    } catch (err) {
      setError(importErrorMessage(tx, err, te));
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
      .catch((err) => setError(importErrorMessage(tx, err, te)))
      .finally(() => setSaving((n) => n - 1));
  }

  async function apply() {
    const v = viewRef.current;
    if (!v || busy || (v.status === "review" && v.counts.pending > 0)) return;
    setBusy("apply");
    setError(null);
    try {
      await queue.current;
      setView(await applyImport(token, v.id));
    } catch (err) {
      setError(importErrorMessage(tx, err, te));
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
      message: tx("As linhas da planilha são apagadas do IPAlpha. O que já foi gravado continua salvo."),
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
      setError(importErrorMessage(tx, err, te));
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
    setConflicts(0);
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
      setError(importErrorMessage(tx, err, te));
    } finally {
      setLoadingMore(false);
    }
  }

  const stage: "pick" | ImportView["status"] = view ? view.status : "pick";
  const title = subject === "camper" ? tx("Importar acampantes") : tx("Importar equipe");
  const failure = view?.status === "failed" ? failureOf(tx, view.failureReason) : null;
  const resumable = !!failure?.resumable;

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
            {subject === "camper" && <p className="cat-hint">{tx("Se a criança tiver um 2º responsável, traga o nome e o celular dele em colunas próprias: ele é ligado à criança nesta importação.")}</p>}
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

        {view && stage === "review" && <ReviewStage view={view} saving={saving > 0} busy={busy} onDecide={decide} onApply={() => void apply()} onCancel={() => void cancel()} />}

        {view && (stage === "applying" || stage === "done") && (
          <section className="cat-form" aria-live="polite">
            <h2 className="cat-form__title">{stage === "applying" ? tx("Gravando no IPAlpha…") : tx("Importação concluída 🎉")}</h2>
            {stage === "applying" && <Steps steps={view.steps} />}
            <Summary view={view} />
            <Reveal open={conflicts > 0}>
              <p className={styles.pendingNote}>
                {tx("{n} valor(es) da planilha não substituíram o que alguém já tinha mudado à mão. Você escolhe qual fica em {list}.", { n: conflicts, list: listLabel })}
              </p>
            </Reveal>
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
              {stage === "cancelled" ? tx("As linhas da planilha foram apagadas do IPAlpha. O que já tinha sido gravado continua salvo.") : failure?.text}
            </p>
            {view.counts.batches > 0 && <Summary view={view} />}
            <div className="cat-form__actions">
              <button type="button" className={`button ${resumable ? "button--secondary" : "button--primary"}`} onClick={startOver}>
                {tx("Começar de novo")}
              </button>
              {resumable && (
                <button type="button" className="button button--primary" disabled={!!busy} onClick={() => void apply()}>
                  {busy === "apply" ? tx("Gravando…") : tx("Continuar gravando")}
                </button>
              )}
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
  const processed = c.created + c.updated + c.skipped + c.failed;
  return (
    <div className={styles.summary}>
      <p className="cat-hint">{tx("{applied} de {rows} linha(s) processadas", { applied: processed, rows: c.rows })}</p>
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

function Badge({ open }: { open: number }) {
  return open > 0 ? <span className={styles.badgeWarn}>{open}</span> : <span className={styles.badgeOk}>✓</span>;
}

interface ReviewStageProps {
  view: ImportView;
  saving: boolean;
  busy: "upload" | "apply" | "cancel" | null;
  onDecide: (d: Decisions) => void;
  onApply: () => void;
  onCancel: () => void;
}

const openCount = (list: ImportReview[]) => list.filter((r) => !r.resolved).length;

function ReviewStage({ view, saving, busy, onDecide, onApply, onCancel }: ReviewStageProps) {
  const { tx } = useI18n();
  const byKind = (...kinds: string[]) => view.reviews.filter((r) => kinds.includes(r.kind));
  const columnReviews = byKind("column");
  const rowKinds = byKind("rowKind");
  const people = byKind("match", "duplicate");
  const invalid = byKind("invalid");
  const categories = byKind("category");
  const observations = byKind("observations");
  const required = byKind("required");
  const columns = Object.keys(view.mapping);
  const pending = view.counts.pending;
  const existingIds = useMemo(() => view.reviews.map((r) => r.existingPersonId).filter((id): id is string => !!id), [view.reviews]);
  const nameOf = useNames(existingIds);
  const decideOne = (id: string, choice: string, extra: { value?: string } = {}) => onDecide({ reviews: [{ id, choice, ...extra }] });

  return (
    <section className="cat-form">
      <h2 className="cat-form__title">{tx("Confira antes de gravar")}</h2>
      <p className="cat-hint">
        {view.file ? `${view.file.name} · ` : ""}
        {tx("{n} linha(s) na planilha", { n: view.counts.rows })}
      </p>

      {columnReviews.length > 0 && (
        <Section title={tx("Colunas que o IPAlpha não encontrou")} badge={<Badge open={openCount(columnReviews)} />} defaultOpen>
          <ul className={styles.pairs}>
            {columnReviews.map((r) => (
              <li key={r.id} className={styles.pair}>
                <span className={styles.pairFrom}>{fieldLabel(tx, r.field, view.appFields)}</span>
                <span aria-hidden="true">←</span>
                <select className="cat-input" aria-label={tx("Coluna com {field}", { field: fieldLabel(tx, r.field, view.appFields) })} value={r.choice ?? ""} onChange={(e) => e.target.value && decideOne(r.id, e.target.value)}>
                  <option value="">{tx("Escolha a coluna…")}</option>
                  {r.options.map((col) => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {rowKinds.length > 0 && (
        <Section title={tx("Tipos de linha para conferir")} badge={<Badge open={openCount(rowKinds)} />} defaultOpen>
          <ul className={styles.reviews}>
            {rowKinds.map((r) => (
              <ReviewChoices
                key={r.id}
                review={r}
                head={tx("“{value}” em {n} linha(s)", { value: r.context.value ?? "", n: r.rowRefs.length })}
                labels={{ camper: tx("Acampantes"), team: tx("Equipe"), skip: tx("Não importar agora") }}
                onChoose={(choice) => decideOne(r.id, choice)}
              />
            ))}
          </ul>
        </Section>
      )}

      {people.length > 0 && (
        <Section title={tx("Pessoas para conferir")} badge={<Badge open={openCount(people)} />} defaultOpen>
          <ul className={styles.reviews}>
            {people.map((r) =>
              r.kind === "match" ? (
                <ReviewChoices
                  key={r.id}
                  review={r}
                  head={
                    <>
                      <strong>{rowLabel(tx, r.rowRef)}</strong>
                      {r.who && WHO_LABEL[r.who] ? ` · ${tx(WHO_LABEL[r.who])}` : ""}
                      {r.context.name ? ` · ${r.context.name}` : ""}
                      {" — "}
                      {r.basis === "phone"
                        ? tx("o celular já é de {name}", { name: nameOf(r.existingPersonId) || tx("uma pessoa cadastrada") })
                        : tx("parece ser {name}, já cadastrado(a)", { name: nameOf(r.existingPersonId) || tx("uma pessoa cadastrada") })}
                    </>
                  }
                  labels={{ match: tx("É a mesma pessoa"), new: tx("Cadastrar como nova pessoa"), skip: tx("Não importar agora") }}
                  onChoose={(choice) => decideOne(r.id, choice)}
                />
              ) : (
                <ReviewChoices
                  key={r.id}
                  review={r}
                  head={
                    <>
                      <strong>{rowLabel(tx, r.rowRef)}</strong>
                      {r.context.name ? ` · ${r.context.name}` : ""}
                      {" — "}
                      {tx("a mesma pessoa já aparece na linha {row}", { row: r.firstRowRef ?? "?" })}
                    </>
                  }
                  labels={{ use: tx("Importar esta linha também"), skip: tx("Não importar esta linha") }}
                  onChoose={(choice) => decideOne(r.id, choice)}
                />
              ),
            )}
          </ul>
        </Section>
      )}

      {invalid.length > 0 && (
        <Section title={tx("Valores para corrigir")} badge={<Badge open={invalid.filter((r) => r.blocking && !r.resolved).length} />} defaultOpen={invalid.some((r) => r.blocking && !r.resolved)}>
          <ul className={styles.reviews}>
            {invalid.map((r) => (
              <InvalidItem key={r.id} review={r} label={fieldLabel(tx, r.field, view.appFields)} onDecide={decideOne} />
            ))}
          </ul>
        </Section>
      )}

      {categories.length > 0 && (
        <Section title={tx("Valores da planilha → opções do Acampa")} badge={<Badge open={openCount(categories)} />}>
          <ul className={styles.pairs}>
            {categories.map((r) => {
              const key = r.field?.startsWith(APP_FIELD_PREFIX) ? r.field.slice(APP_FIELD_PREFIX.length) : "";
              const f = view.appFields.find((a) => a.key === key);
              const label = f ? appFieldLabel(tx, f) : key;
              return (
                <li key={r.id} className={styles.pair}>
                  <span className={styles.pairFrom}>
                    {label}: {r.context.value || tx("(vazio)")}
                  </span>
                  <span aria-hidden="true">→</span>
                  <select className="cat-input" aria-label={tx("{field}: {value}", { field: label, value: r.context.value || tx("(vazio)") })} value={r.choice ?? ""} onChange={(e) => e.target.value && decideOne(r.id, e.target.value)}>
                    <option value="">{tx("Escolha…")}</option>
                    {(f?.categories ?? []).map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                    <option value="none">{tx("Deixar em branco")}</option>
                  </select>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {observations.map((r) => (
        <Section key={r.id} title={tx("Observações que o IPAlpha não conseguiu organizar")} badge={<Badge open={openCount([r])} />} defaultOpen>
          <ReviewChoices
            review={r}
            head={tx("{n} linha(s) têm observações que não couberam em nenhum campo. Onde guardamos?", { n: r.context.rows ?? r.rowRefs.length })}
            labels={Object.fromEntries(r.options.map((o) => [o, o === "healthNotes" ? tx("Nas anotações de saúde (IPAlpha)") : o === "drop" ? tx("Não guardar") : tx("Em {field}", { field: fieldLabel(tx, o, view.appFields) })]))}
            onChoose={(choice) => decideOne(r.id, choice)}
            asBlock
          />
        </Section>
      ))}

      {required.length > 0 && (
        <Section title={tx("Campos obrigatórios em branco")} badge={<Badge open={openCount(required)} />} defaultOpen>
          {required.map((r) => (
            <RequiredDecisionField key={r.id} review={r} appFields={view.appFields} onDecide={onDecide} />
          ))}
        </Section>
      )}

      {columns.length > 0 && (
        <Section title={tx("Colunas da planilha")} badge={<span className={styles.badgeNeutral}>{columns.length}</span>}>
          <p className="cat-hint">{tx("Mudar uma coluna faz o IPAlpha reler a planilha; suas escolhas continuam guardadas.")}</p>
          <ul className={styles.pairs}>
            {columns.map((col) => (
              <li key={col} className={styles.pair}>
                <span className={styles.pairFrom}>{col}</span>
                <span aria-hidden="true">→</span>
                <select className="cat-input" aria-label={tx("Coluna {column}", { column: col })} value={view.mapping[col] ?? ""} onChange={(e) => onDecide({ mapping: { [col]: e.target.value || null } })}>
                  <option value="">{tx("Não importar esta coluna")}</option>
                  {view.fields.map((key) => (
                    <option key={key} value={key}>
                      {fieldLabel(tx, key, view.appFields)}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Reveal open={pending > 0}>
        <p className={styles.pendingNote}>{tx("Para gravar, responda {n} pergunta(s) marcada(s) acima.", { n: pending })}</p>
      </Reveal>

      <div className="cat-form__actions">
        {saving && <span className="cat-hint">{tx("Guardando sua escolha…")}</span>}
        <button type="button" className="button button--secondary" disabled={!!busy} onClick={onCancel}>
          {busy === "cancel" ? tx("Cancelando…") : tx("Cancelar importação")}
        </button>
        <button type="button" className="button button--primary" disabled={pending > 0 || !!busy || saving} onClick={onApply}>
          {busy === "apply" ? tx("Gravando…") : tx("Gravar no IPAlpha")}
        </button>
      </div>
    </section>
  );
}

/** One question with its options as buttons (the chosen one stays marked). */
function ReviewChoices({ review: r, head, labels, onChoose, asBlock }: { review: ImportReview; head: ReactNode; labels: Record<string, string>; onChoose: (choice: string) => void; asBlock?: boolean }) {
  const body = (
    <>
      <p className={styles.reviewHead}>{head}</p>
      <div className={styles.choices}>
        {r.options.map((option) => {
          const on = r.choice === option;
          return (
            <button key={option} type="button" aria-pressed={on} className={`${styles.choice} ${on ? styles.choiceOn : ""}`} onClick={() => onChoose(option)}>
              {labels[option] ?? option}
            </button>
          );
        })}
      </div>
    </>
  );
  if (asBlock) return <div className={`${styles.review} ${r.resolved ? styles.reviewDone : ""}`}>{body}</div>;
  return <li className={`${styles.review} ${r.resolved ? styles.reviewDone : ""}`}>{body}</li>;
}

function InvalidItem({ review: r, label, onDecide }: { review: ImportReview; label: string; onDecide: (id: string, choice: string, extra?: { value?: string }) => void }) {
  const { tx } = useI18n();
  const [text, setText] = useState(r.choice === "value" ? (r.value ?? "") : (r.context.original ?? ""));
  const fallback = r.options.find((o) => o !== "value") ?? "drop";
  return (
    <li className={`${styles.review} ${r.resolved ? styles.reviewDone : ""}`}>
      <p className={styles.reviewHead}>
        <strong>{rowLabel(tx, r.rowRef)}</strong>
        {r.context.name ? ` · ${r.context.name}` : ""} — {r.context.original ? tx("{field}: “{value}” não parece certo", { field: label, value: r.context.original }) : tx("{field} está em branco", { field: label })}
      </p>
      <div className={styles.defaultRow}>
        <input className="cat-input" aria-label={tx("Valor correto de {field}", { field: label })} value={text} onChange={(e) => setText(e.target.value)} />
        <button type="button" className={`${styles.choice} ${r.choice === "value" ? styles.choiceOn : ""}`} aria-pressed={r.choice === "value"} disabled={!text.trim()} onClick={() => onDecide(r.id, "value", { value: text.trim() })}>
          {tx("Usar este valor")}
        </button>
        <button type="button" className={`${styles.choice} ${r.choice === fallback ? styles.choiceOn : ""}`} aria-pressed={r.choice === fallback} onClick={() => onDecide(r.id, fallback)}>
          {fallback === "skip" ? tx("Não importar esta linha agora") : tx("Deixar em branco")}
        </button>
      </div>
    </li>
  );
}

function RequiredDecisionField({ review: r, appFields, onDecide }: { review: ImportReview; appFields: AppField[]; onDecide: (d: Decisions) => void }) {
  const { tx } = useI18n();
  const key = r.field?.startsWith(APP_FIELD_PREFIX) ? r.field.slice(APP_FIELD_PREFIX.length) : (r.field ?? "");
  const field = appFields.find((f) => f.key === key);
  const label = field ? appFieldLabel(tx, field) : key;
  const [mode, setMode] = useState<"default" | "skip" | null>(r.choice === "default" || r.choice === "skip" ? r.choice : null);
  const [text, setText] = useState(r.choice === "default" ? (r.value ?? "") : "");
  useEffect(() => {
    if (r.choice === "default" || r.choice === "skip") setMode(r.choice);
    if (r.choice === "default") setText(r.value ?? "");
  }, [r.choice, r.value]);
  const categoryValue = r.choice === "default" ? (r.value ?? "") : "";

  return (
    <fieldset className={`${styles.required} ${!r.resolved ? styles.requiredPending : ""}`}>
      <legend className={styles.requiredTitle}>{tx("{field}: {n} linha(s) sem valor", { field: label, n: r.rowRefs.length })}</legend>
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
            onDecide({ reviews: [{ id: r.id, choice: "skip" }] });
          }}
        >
          {tx("Não importar essas linhas agora")}
        </button>
      </div>
      <Reveal open={mode === "default"}>
        <div className={styles.defaultRow}>
          {field?.kind === "category" ? (
            <select
              className="cat-input"
              aria-label={tx("Valor para as linhas vazias de {field}", { field: label })}
              value={categoryValue}
              onChange={(e) => e.target.value && onDecide({ reviews: [{ id: r.id, choice: "default", value: e.target.value }] })}
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
              <button type="button" className="button button--secondary" disabled={!text.trim()} onClick={() => onDecide({ reviews: [{ id: r.id, choice: "default", value: text.trim() }] })}>
                {tx("Usar este valor")}
              </button>
            </>
          )}
        </div>
      </Reveal>
    </fieldset>
  );
}

function Results({ batches, appFields, listLabel, hasMore, loadingMore, onMore }: { batches: ResultBatch[]; appFields: AppField[]; listLabel: string; hasMore: boolean; loadingMore: boolean; onMore: () => void }) {
  const { tx } = useI18n();
  const ids = useMemo(() => batches.flatMap((b) => b.rows.map((r) => r.personId).filter((id): id is string => !!id)), [batches]);
  const nameOf = useNames(ids);
  const labelOf = (key: string) => fieldLabel(tx, `${APP_FIELD_PREFIX}${key}`, appFields);
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
                {row.reason && (row.status === "skipped" || row.status === "failed") && <span className={styles.reason}>{reasonLabel(tx, row.reason)}</span>}
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
