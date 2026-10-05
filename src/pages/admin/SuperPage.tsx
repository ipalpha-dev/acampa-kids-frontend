import { useEffect, useState } from "react";
import { confirmCampDelete, fetchCamps, requestCampDelete, updateCamp, type CampRow } from "../../api/camps";
import { ApiError } from "../../api/client";
import { fetchImportCacheCount, wipeImportCache } from "../../api/super";
import type { CampSummary } from "../../auth/store";
import AdminsEditor from "../../components/AdminsEditor";
import { useConfirm } from "../../components/ConfirmDialog";
import CreateCampDialog from "../../components/CreateCampDialog";
import Dialog from "../../components/Dialog";
import OtpInput from "../../components/OtpInput";
import { useRoute } from "../../router";
import { useCollection } from "../../store";
import { ICONS } from "../../icons";
import type { LoggedUser } from "../../roles";
import { useI18n } from "../../i18n";
import styles from "./data.module.scss";

interface SuperPageProps {
  token: string;
  user: LoggedUser;
  camp: CampSummary;
  onSwitchCamp: (campId: string) => Promise<void>;
}

/**
 * ⚙️ → Superusuário (Acampamentos, for a plain admin): the camp registry for
 * everyone who reaches this page, plus — deployment owner only — the admin
 * list, the import cache and a link to the assistant's seed templates.
 */
export default function SuperPage({ token, user, camp, onSwitchCamp }: SuperPageProps) {
  const { tx } = useI18n();
  const { navigate } = useRoute();
  const confirm = useConfirm();
  const settings = useCollection("settings");
  const isSuper = !!settings?.superAdmin;
  const title = isSuper ? tx("Superusuário") : tx("Acampamentos");

  const [camps, setCamps] = useState<CampRow[] | null>(null);
  const [campsError, setCampsError] = useState(false);
  const [reload, setReload] = useState(0);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [rowDone, setRowDone] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<CampRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CampRow | null>(null);

  useEffect(() => {
    let alive = true;
    setCampsError(false);
    fetchCamps(token)
      .then((c) => alive && setCamps(c))
      .catch(() => alive && setCampsError(true));
    return () => {
      alive = false;
    };
  }, [token, reload]);

  async function activate(c: CampRow) {
    if (rowBusy) return;
    const ok = await confirm({
      emoji: "🏕️",
      title: tx('Tornar "{label}" o acampamento ativo?', { label: c.label }),
      message: tx("{year} vira o acampamento arquivado; você entra em {newYear}.", { year: camp.year, newYear: c.year }),
      confirmLabel: tx("Tornar ativo"),
    });
    if (!ok) return;
    setRowBusy(c.id);
    setRowError(null);
    try {
      await updateCamp(token, c.id, { active: true });
      await onSwitchCamp(c.id);
    } catch (e) {
      setRowError(e instanceof Error ? e.message : tx("Algo deu errado."));
      setRowBusy(null);
    }
  }

  async function archive(c: CampRow) {
    if (rowBusy) return;
    const ok = await confirm({
      emoji: "🔒",
      title: tx('Arquivar "{label}"?', { label: c.label }),
      message: tx("Fica só leitura — visível para o admin e para quem organiza o acampamento ativo."),
      confirmLabel: tx("Arquivar"),
      danger: true,
    });
    if (!ok) return;
    setRowBusy(c.id);
    setRowError(null);
    try {
      await updateCamp(token, c.id, { archived: true });
      setReload((r) => r + 1);
    } catch (e) {
      setRowError(e instanceof Error ? e.message : tx("Algo deu errado."));
    } finally {
      setRowBusy(null);
    }
  }

  function onCampDeleted(removed: number) {
    setDeleteTarget(null);
    setRowDone(tx("Acampamento apagado: {n} registro(s) removido(s).", { n: removed }));
    setReload((r) => r + 1);
  }

  const [importCache, setImportCache] = useState<{ count: number; staff: number; campers: number } | null>(null);
  const [cacheBusy, setCacheBusy] = useState(false);
  const [cacheError, setCacheError] = useState<string | null>(null);
  const [cacheDone, setCacheDone] = useState<string | null>(null);
  const [cacheReload, setCacheReload] = useState(0);

  useEffect(() => {
    if (!isSuper) return;
    let alive = true;
    fetchImportCacheCount(token)
      .then((r) => alive && setImportCache(r))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [token, isSuper, cacheReload]);

  async function cleanCache() {
    if (cacheBusy) return;
    const n = importCache?.count ?? 0;
    const ok = await confirm({
      emoji: "🧹",
      title: tx("Limpar o cache de importação?"),
      message: (
        <>
          {tx("Apaga as {n} correspondências que a importação de equipe e de acampantes guardou (coluna da planilha → valor do app).", { n })}
          <br />
          {tx("A próxima importação vai remontar o mapeamento do zero. Não apaga nenhum cadastro.")}
        </>
      ),
      confirmLabel: tx("Limpar cache"),
      danger: true,
    });
    if (!ok) return;
    setCacheBusy(true);
    setCacheError(null);
    setCacheDone(null);
    try {
      const { removed } = await wipeImportCache(token);
      setCacheReload((r) => r + 1);
      setCacheDone(tx("{n} correspondência(s) do cache apagada(s).", { n: removed }));
    } catch (e) {
      setCacheError(e instanceof Error ? e.message : tx("Algo deu errado."));
    } finally {
      setCacheBusy(false);
    }
  }

  return (
    <div className="admin-page">
      <header className="admin-head">
        <h1 className="admin-title">
          <img className="admin-title__icon" src={ICONS.superUser} alt="" aria-hidden="true" /> {title}
        </h1>
        <button type="button" className="button button--primary admin-head__new" onClick={() => setCreateOpen(true)}>
          <img className="audience-icon" src={ICONS.createNew} alt="" aria-hidden="true" /> {tx("Novo acampamento")}
        </button>
      </header>

      <section className="cat-form">
        <h2 className="cat-form__title">{tx("🏕️ Acampamentos")}</h2>
        {camps == null && !campsError && <p className="opt-empty">{tx("Carregando…")}</p>}
        {campsError && <p className="cat-hint">{tx("Não foi possível carregar os acampamentos agora.")}</p>}
        {camps && camps.length === 0 && <p className="opt-empty">{tx("Nenhum acampamento cadastrado.")}</p>}
        {rowError && <p className="message message--error">{rowError}</p>}
        {rowDone && <p className="message message--ok">✅ {rowDone}</p>}
        {camps && camps.length > 0 && (
          <div className="camps-list">
            {camps.map((c) => (
              <div key={c.id} className="seeds-place camps-row">
                <div className="seeds-place__head">
                  <span className="seeds-place__name">
                    {c.label} <span className="cat-hint">({c.year})</span>
                  </span>
                  <span className={`badge ${c.active ? "badge--active" : "badge--archived"}`}>
                    {c.active ? tx("Ativo") : tx("Arquivado")}
                  </span>
                </div>
                <p className="cat-hint">
                  {tx("{campers} acampante(s) · {staff} na equipe · {photos} foto(s)", {
                    campers: c.counts.campers,
                    staff: c.counts.staff,
                    photos: c.counts.photos,
                  })}
                </p>
                <div className="camps-row__actions">
                  <button type="button" className="link-btn" disabled={rowBusy === c.id} onClick={() => setRenameTarget(c)}>
                    {tx("Renomear")}
                  </button>
                  {!c.active && (
                    <button type="button" className="link-btn" disabled={rowBusy === c.id} onClick={() => void activate(c)}>
                      {rowBusy === c.id ? tx("Entrando…") : tx("Tornar ativo")}
                    </button>
                  )}
                  {!c.active && (
                    <button type="button" className="link-btn" disabled={rowBusy === c.id} onClick={() => void archive(c)}>
                      {tx("Arquivar")}
                    </button>
                  )}
                  {!c.active && (
                    <button type="button" className="link-btn link-btn--danger" disabled={rowBusy === c.id} onClick={() => setDeleteTarget(c)}>
                      {tx("Apagar")}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {isSuper && (
        <section className="cat-form">
          <h2 className="cat-form__title">🔑 {tx("Administradores")}</h2>
          <AdminsEditor token={token} user={user} />
        </section>
      )}

      {isSuper && (
        <section className="cat-form">
          <h2 className="cat-form__title">
            <img className="admin-title__icon" src={ICONS.importCampers} alt="" aria-hidden="true" /> {tx("Cache de importação")}
          </h2>
          <p className="cat-hint">
            {tx("As correspondências que a importação de equipe e de acampantes guarda (coluna da planilha → valor do app). Limpar não apaga nenhum cadastro.")}
          </p>
          {cacheError && <p className="message message--error">{cacheError}</p>}
          {cacheDone && <p className="message message--ok">✅ {cacheDone}</p>}
          <p className={`cat-form__title ${styles.cacheCount}`}>
            {importCache == null
              ? "…"
              : tx("{n} {unit}", { n: importCache.count, unit: tx(importCache.count === 1 ? "correspondência" : "correspondências") })}
          </p>
          <div className="cat-form__actions">
            <button type="button" className="button button--danger" disabled={cacheBusy || importCache?.count === 0} onClick={() => void cleanCache()}>
              {cacheBusy ? tx("Limpando…") : importCache?.count === 0 ? tx("Já está limpo") : tx("🧹 Limpar cache")}
            </button>
          </div>
        </section>
      )}

      {isSuper && (
        <section className="cat-form">
          <h2 className="cat-form__title">🌱 {tx("Sementes")}</h2>
          <button type="button" className="link-btn" onClick={() => navigate("/super/seeds")}>
            {tx("Modelos do assistente ›")}
          </button>
        </section>
      )}

      <CreateCampDialog open={createOpen} token={token} currentYear={camp.year} onClose={() => setCreateOpen(false)} onSwitchCamp={onSwitchCamp} />
      <RenameCampDialog
        camp={renameTarget}
        token={token}
        onClose={() => setRenameTarget(null)}
        onSaved={() => {
          setRenameTarget(null);
          setReload((r) => r + 1);
        }}
      />
      <DeleteCampDialog camp={deleteTarget} token={token} onClose={() => setDeleteTarget(null)} onDeleted={onCampDeleted} />
    </div>
  );
}

function RenameCampDialog({ camp, token, onClose, onSaved }: { camp: CampRow | null; token: string; onClose: () => void; onSaved: (c: CampRow) => void }) {
  const { tx } = useI18n();
  const [label, setLabel] = useState("");
  const [year, setYear] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!camp) return;
    setLabel(camp.label);
    setYear(String(camp.year));
    setError(null);
  }, [camp]);

  const yearNumber = Number(year);
  const ready = !!label.trim() && Number.isInteger(yearNumber) && yearNumber > 2000 && yearNumber < 3000;

  async function submit() {
    if (!camp || !ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await updateCamp(token, camp.id, { label: label.trim(), year: yearNumber });
      onSaved({ ...camp, label: updated.label, year: updated.year });
    } catch (e) {
      setError(e instanceof Error ? e.message : tx("Algo deu errado."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!camp} onClose={() => !busy && onClose()} title={tx("Renomear acampamento")} width={420} dismissible={!busy} className="sheet-dialog" autofocus>
      {camp && (
        <form
          className="cat-form cat-form--plain"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <span className="sheet__handle" aria-hidden="true" />
          <h2 className="cat-form__title">{tx("Renomear acampamento")}</h2>
          <label className="cat-field">
            <span className="cat-field__label">{tx("Nome")}</span>
            <input className="cat-input" value={label} maxLength={80} disabled={busy} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <label className="cat-field">
            <span className="cat-field__label">{tx("Ano")}</span>
            <input className="cat-input" type="number" inputMode="numeric" value={year} disabled={busy} onChange={(e) => setYear(e.target.value)} />
          </label>
          {error && <p className="message message--error">{error}</p>}
          <div className="cat-form__actions">
            <button type="button" className="button button--secondary" disabled={busy} onClick={onClose}>
              {tx("Cancelar")}
            </button>
            <button type="submit" className="button button--primary" disabled={busy || !ready}>
              {busy ? tx("Salvando…") : tx("Salvar")}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

type DeleteStep = "confirm" | "code";

function DeleteCampDialog({ camp, token, onClose, onDeleted }: { camp: CampRow | null; token: string; onClose: () => void; onDeleted: (removed: number) => void }) {
  const { tx } = useI18n();
  const [step, setStep] = useState<DeleteStep>("confirm");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  useEffect(() => {
    if (!camp) return;
    setExpiresAt(null);
    setStep("confirm");
    setError(null);
    setCode("");
    setAttemptsLeft(null);
  }, [camp]);

  async function requestCode() {
    if (!camp || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await requestCampDelete(token, camp.id);
      setExpiresAt(res.expiresAt);
      setStep("code");
    } catch (e) {
      setError(e instanceof Error ? e.message : tx("Algo deu errado."));
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete(value: string) {
    if (!camp || busy || value.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      const res = await confirmCampDelete(token, camp.id, value);
      onDeleted(res.removed);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.code === "INVALID_CODE") {
          setAttemptsLeft(e.attemptsLeft ?? null);
          setCode("");
        } else if (e.code === "CODE_EXPIRED" || e.code === "TOO_MANY_ATTEMPTS") {
          setCode("");
        }
      }
      setError(e instanceof Error ? e.message : tx("Algo deu errado."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!camp} onClose={() => !busy && onClose()} title={tx("Apagar acampamento")} width={420} dismissible={!busy} className="sheet-dialog" autofocus>
      {camp && step === "confirm" && (
        <div className="cat-form cat-form--plain">
          <span className="sheet__handle" aria-hidden="true" />
          <h2 className="cat-form__title">{tx('Apagar "{label}"?', { label: camp.label })}</h2>
          <p className="cat-hint">
            {tx("Isso apaga para sempre o que o acampamento guarda de {label}: a participação de {campers} acampante(s) e {staff} pessoa(s) da equipe (quartos, times, check-ins) e {photos} foto(s). Os cadastros das pessoas continuam no IPAlpha. Não pode ser desfeito.", {
              campers: camp.counts.campers,
              staff: camp.counts.staff,
              photos: camp.counts.photos,
              label: camp.label,
            })}
          </p>
          <p className="cat-hint">{tx("Vamos mandar um código de confirmação por SMS para o seu celular.")}</p>
          {error && <p className="message message--error">{error}</p>}
          <div className="cat-form__actions">
            <button type="button" className="button button--secondary" disabled={busy} onClick={onClose}>
              {tx("Cancelar")}
            </button>
            <button type="button" className="button button--danger" disabled={busy} onClick={() => void requestCode()}>
              {busy ? tx("Enviando…") : tx("Apagar")}
            </button>
          </div>
        </div>
      )}
      {camp && step === "code" && (
        <div className="cat-form cat-form--plain">
          <span className="sheet__handle" aria-hidden="true" />
          <h2 className="cat-form__title">{tx("Confirme o código")}</h2>
          <p className="cat-hint">
            {expiresAt
              ? tx("Mandamos um código por SMS para o seu celular cadastrado no IPAlpha. Ele vale até {time}.", { time: new Date(expiresAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) })
              : tx("Mandamos um código por SMS para o seu celular cadastrado no IPAlpha.")}
          </p>
          <OtpInput value={code} onChange={setCode} onComplete={(v) => void confirmDelete(v)} disabled={busy} autoFocus invalid={!!error} />
          {error && (
            <p className="message message--error">
              {error}
              {attemptsLeft != null && <span> · {tx("{n} tentativa(s) restante(s)", { n: attemptsLeft })}</span>}
            </p>
          )}
          <div className="cat-form__actions">
            <button type="button" className="button button--secondary" disabled={busy} onClick={onClose}>
              {tx("Cancelar")}
            </button>
            <button type="button" className="button button--danger" disabled={busy || code.length !== 6} onClick={() => void confirmDelete(code)}>
              {busy ? tx("Apagando…") : tx("Confirmar exclusão")}
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
