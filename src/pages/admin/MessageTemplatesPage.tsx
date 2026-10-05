import { useEffect, useMemo, useRef, useState } from "react";
import {
  draftProblems,
  insertVariable,
  listTemplates,
  resetTemplate,
  seedTemplates,
  smsCounter,
  TEMPLATE_LANGS,
  updateTemplate,
  type DraftProblem,
  type LocalizedText,
  type MessageTemplate,
  type TemplateLang,
} from "../../api/templates";
import { useConfirm } from "../../components/ConfirmDialog";
import { useI18n } from "../../i18n";
import styles from "./MessageTemplatesPage.module.scss";

/** Each language named in itself (content languages — not a UI language switcher). */
const LANG_NAME: Record<TemplateLang, string> = { "pt-BR": "Português", "en-US": "English", es: "Español", fr: "Français", de: "Deutsch" };

interface MessageTemplatesPageProps {
  token: string;
}

/**
 * Configurações → Mensagens (coordenação): the project's SMS / e-mail
 * templates, in 5 languages. Each template keeps the variables Acampa fills
 * in ({name}, {room}…); SMS stay within 160 characters per language. Saved
 * in IPAlpha (projects-api) — Mordomia shows the same copy.
 */
export default function MessageTemplatesPage({ token }: MessageTemplatesPageProps) {
  const { tx } = useI18n();
  const [templates, setTemplates] = useState<MessageTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setTemplates(await listTemplates(token));
    } catch (err) {
      setError(err instanceof Error ? err.message : tx("Algo deu errado."));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const missing = templates?.filter((t) => !t.live).length ?? 0;

  async function seed() {
    if (seeding) return;
    setSeeding(true);
    setNotice(null);
    setError(null);
    try {
      const res = await seedTemplates(token);
      setNotice(tx("{n} modelo(s) criado(s) no IPAlpha.", { n: res.created }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : tx("Algo deu errado."));
    } finally {
      setSeeding(false);
    }
  }

  const replace = (t: MessageTemplate) => setTemplates((list) => (list ?? []).map((x) => (x.slug === t.slug ? t : x)));
  const groups: { channel: MessageTemplate["channel"]; title: string }[] = [
    { channel: "sms", title: tx("SMS") },
    { channel: "email", title: tx("E-mail") },
  ];

  return (
    <div className="admin-page">
      <header className="admin-head">
        <h1 className="admin-title">✉️ {tx("Mensagens")}</h1>
      </header>
      <p className="admin-intro">
        {tx("Os textos dos SMS e e-mails que o acampamento envia, nos 5 idiomas. As palavras entre chaves, como {name}, são preenchidas na hora do envio. Cada SMS cabe em 160 caracteres.", { name: "{name}" })}
      </p>
      {error && <p className="message message--error">{error}</p>}
      {notice && <p className="message message--ok">✅ {notice}</p>}
      {missing > 0 && (
        <div className={styles.seed}>
          <p className="cat-hint">{tx("{n} modelo(s) ainda usam o texto padrão e não estão no IPAlpha.", { n: missing })}</p>
          <button type="button" className="button button--secondary" disabled={seeding} onClick={() => void seed()}>
            {seeding ? tx("Criando…") : tx("Criar no IPAlpha")}
          </button>
        </div>
      )}
      {!templates && !error && <p className="opt-empty">{tx("Carregando…")}</p>}
      {templates &&
        groups.map((g) => {
          const list = templates.filter((t) => t.channel === g.channel);
          if (!list.length) return null;
          return (
            <section key={g.channel} className={styles.group}>
              <h2 className={styles.groupTitle}>{g.title}</h2>
              <ul className={styles.list}>
                {list.map((t) => (
                  <li key={t.slug} className={`${styles.item} ${open === t.slug ? styles.itemOpen : ""}`}>
                    <button type="button" className={styles.itemHead} aria-expanded={open === t.slug} onClick={() => setOpen(open === t.slug ? null : t.slug)}>
                      <span className={styles.itemName}>{t.name}</span>
                      <span className={styles.badges}>
                        {t.customized && <span className={`${styles.badge} ${styles.badgeCustom}`}>{tx("personalizado")}</span>}
                        {!t.live && <span className={styles.badge}>{tx("texto padrão")}</span>}
                      </span>
                      <span className={styles.chevron} aria-hidden="true">›</span>
                    </button>
                    <div className={styles.panel}>
                      <div className={styles.panelInner}>
                        {open === t.slug && <TemplateEditor token={token} template={t} onSaved={replace} />}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
    </div>
  );
}

interface TemplateEditorProps {
  token: string;
  template: MessageTemplate;
  onSaved: (t: MessageTemplate) => void;
}

/** One template: name, per-language subject / body with the SMS counter and the variable chips. */
export function TemplateEditor({ token, template, onSaved }: TemplateEditorProps) {
  const { tx } = useI18n();
  const confirm = useConfirm();
  const [name, setName] = useState(template.name);
  const [body, setBody] = useState<LocalizedText>(template.body);
  const [subject, setSubject] = useState<LocalizedText | null>(template.subject);
  const [lang, setLang] = useState<TemplateLang>("pt-BR");
  const [busy, setBusy] = useState<"save" | "reset" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setName(template.name);
    setBody(template.body);
    setSubject(template.subject);
  }, [template]);

  const isSms = template.channel === "sms";
  const problems = useMemo(() => draftProblems({ channel: template.channel, variables: template.variables, body, subject }), [template, body, subject]);
  const dirty = name !== template.name || JSON.stringify(body) !== JSON.stringify(template.body) || JSON.stringify(subject) !== JSON.stringify(template.subject);
  const text = body[lang] ?? "";
  const counter = smsCounter(text);
  const langHasProblem = (l: TemplateLang) => problems.some((p) => "lang" in p && p.lang === l) || (l === "pt-BR" && problems.some((p) => p.kind === "ptRequired"));

  function problemText(p: DraftProblem): string {
    if (p.kind === "ptRequired") return tx("O texto em português é obrigatório.");
    if (p.kind === "tooLong") return tx("{lang}: o SMS passou de 160 caracteres ({n}).", { lang: LANG_NAME[p.lang], n: p.length });
    return tx("{lang}: variável desconhecida {names}.", { lang: LANG_NAME[p.lang], names: p.names.map((n) => `{${n}}`).join(", ") });
  }

  function addVariable(v: string) {
    const el = bodyRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? start;
    const next = insertVariable(text, v, start, end);
    setBody((b) => ({ ...b, [lang]: next.text }));
    setSaved(false);
    requestAnimationFrame(() => {
      if (!bodyRef.current) return;
      bodyRef.current.focus();
      bodyRef.current.setSelectionRange(next.caret, next.caret);
    });
  }

  async function save() {
    if (busy || problems.length) return;
    setBusy("save");
    setError(null);
    try {
      const t = await updateTemplate(token, template.slug, { ...(name !== template.name ? { name } : {}), body, ...(subject ? { subject } : {}) });
      onSaved(t);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : tx("Algo deu errado."));
    } finally {
      setBusy(null);
    }
  }

  async function reset() {
    if (busy) return;
    const ok = await confirm({ title: tx("Voltar ao texto padrão?"), message: tx("O texto deste modelo volta ao original do Acampa Kids, nos 5 idiomas."), confirmLabel: tx("Restaurar") });
    if (!ok) return;
    setBusy("reset");
    setError(null);
    try {
      onSaved(await resetTemplate(token, template.slug));
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : tx("Algo deu errado."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <form
      className={styles.editor}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label className="cat-field">
        <span className="cat-field__label">{tx("Nome do modelo")}</span>
        <input className="cat-input" value={name} maxLength={120} disabled={!!busy} onChange={(e) => { setName(e.target.value); setSaved(false); }} />
      </label>

      <div className={styles.langs} role="tablist" aria-label={tx("Idioma do texto")}>
        {TEMPLATE_LANGS.map((l) => (
          <button key={l} type="button" role="tab" aria-selected={lang === l} className={`${styles.lang} ${lang === l ? styles.langOn : ""} ${langHasProblem(l) ? styles.langWarn : ""}`} onClick={() => setLang(l)}>
            {LANG_NAME[l]}
          </button>
        ))}
      </div>

      {subject && (
        <label className="cat-field">
          <span className="cat-field__label">{tx("Assunto")}</span>
          <input className="cat-input" value={subject[lang] ?? ""} disabled={!!busy} onChange={(e) => { setSubject((s) => ({ ...(s ?? {}), [lang]: e.target.value })); setSaved(false); }} />
        </label>
      )}

      <label className="cat-field">
        <span className="cat-field__label">{isSms ? tx("Texto do SMS") : tx("Texto do e-mail")}</span>
        <textarea
          ref={bodyRef}
          className={`cat-input ${styles.body}`}
          value={text}
          rows={isSms ? 4 : 8}
          disabled={!!busy}
          aria-describedby={isSms ? `${template.slug}-counter` : undefined}
          onChange={(e) => { setBody((b) => ({ ...b, [lang]: e.target.value })); setSaved(false); }}
        />
      </label>
      {isSms && (
        <p id={`${template.slug}-counter`} className={`${styles.counter} ${counter.over ? styles.counterOver : counter.left <= 15 ? styles.counterNear : ""}`} aria-live="polite">
          {tx("{n} de {max} caracteres", { n: counter.length, max: counter.max })}
        </p>
      )}

      {template.variables.length > 0 && (
        <div className={styles.vars}>
          <span className="cat-hint">{tx("Inserir:")}</span>
          {template.variables.map((v) => (
            <button key={v} type="button" className={styles.var} disabled={!!busy} onClick={() => addVariable(v)} title={tx("Inserir {var} no texto", { var: `{${v}}` })}>
              {`{${v}}`}
            </button>
          ))}
        </div>
      )}

      <div className={`${styles.problems} ${problems.length ? styles.problemsOpen : ""}`} aria-live="polite">
        <ul className={styles.problemsInner}>
          {problems.map((p, i) => (
            <li key={i}>{problemText(p)}</li>
          ))}
        </ul>
      </div>
      {error && <p className="message message--error">{error}</p>}
      {saved && !dirty && <p className="message message--ok">✅ {tx("Salvo no IPAlpha.")}</p>}

      <div className="cat-form__actions">
        {template.defaults && (template.customized || dirty) && (
          <button type="button" className="button button--secondary" disabled={!!busy} onClick={() => void reset()}>
            {busy === "reset" ? tx("Restaurando…") : tx("Restaurar padrão")}
          </button>
        )}
        <button type="submit" className="button button--primary" disabled={!!busy || !dirty || problems.length > 0}>
          {busy === "save" ? tx("Salvando…") : tx("Salvar")}
        </button>
      </div>
    </form>
  );
}
