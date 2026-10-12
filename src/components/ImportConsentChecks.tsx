import { useEffect, useState } from "react";
import { fetchImportConsentDocuments, type ImportConsentDocument } from "../api/imports";
import { useI18n, type Locale } from "../i18n";
import SafeMarkdown from "./SafeMarkdown";
import styles from "./ImportConsentChecks.module.scss";

interface ImportConsentChecksProps {
  token: string;
  /** the ticked documents ({document, version} exactly as shown) */
  value: readonly { document: string; version: number }[];
  onChange: (next: { document: string; version: number }[]) => void;
  disabled?: boolean;
  /** bump to read the documents again (e.g. after a 409 CONSENT_VERSION_CHANGED) */
  reloadKey?: number;
}

const TITLE_KEY: Record<Locale, string> = { pt: "pt-BR", en: "en-US", es: "es", fr: "fr", de: "de" };

/**
 * The kids' import, job-level (Kevyn 2026-10-12): one checkbox per document the edition requires of the kids, at its
 * current version — "the families accepted it on the enrollment form". Unticked by default; the exact text can be read
 * right here. It applies to every child of the spreadsheet and is never derived from a column or AI.
 */
export default function ImportConsentChecks({ token, value, onChange, disabled, reloadKey = 0 }: ImportConsentChecksProps) {
  const { tx, locale } = useI18n();
  const [docs, setDocs] = useState<ImportConsentDocument[]>([]);
  const [reading, setReading] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchImportConsentDocuments(token)
      .then((list) => {
        if (!alive) return;
        setDocs(list);
        // a ticked version that is no longer current is dropped: the coordenação ticks the new one knowingly
        const current = new Set(list.map((d) => `${d.document}@${d.version}`));
        const kept = value.filter((v) => current.has(`${v.document}@${v.version}`));
        if (kept.length !== value.length) onChange(kept);
      })
      .catch(() => alive && setDocs([])); // nothing to offer right now: the import works without it
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, reloadKey]);

  if (docs.length === 0) return null;
  const titleOf = (d: ImportConsentDocument) => d.title[TITLE_KEY[locale]] ?? d.title["pt-BR"] ?? d.document;

  return (
    <fieldset className={styles.box} disabled={disabled}>
      <legend className={styles.legend}>{tx("Autorização do acampamento")}</legend>
      {docs.map((d) => {
        const key = `${d.document}@${d.version}`;
        const on = value.some((v) => v.document === d.document && v.version === d.version);
        const open = reading === key;
        return (
          <div key={key} className={styles.doc}>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={on}
                onChange={(e) => onChange(e.target.checked ? [...value.filter((v) => v.document !== d.document), { document: d.document, version: d.version }] : value.filter((v) => v.document !== d.document))}
              />
              <span>{tx("As famílias aceitaram o documento {title} v{n} no formulário de inscrição", { title: titleOf(d), n: d.version })}</span>
            </label>
            <button type="button" className={`link-btn ${styles.read}`} aria-expanded={open} onClick={() => setReading(open ? null : key)}>
              {open ? tx("Fechar o texto") : tx("Ler o texto")}
            </button>
            <div className={`${styles.reveal} ${open ? styles.revealOpen : ""}`} aria-hidden={open ? undefined : true} inert={!open}>
              <div className={styles.revealInner}>
                <div className={styles.text} role="document" aria-label={titleOf(d)} tabIndex={open ? 0 : -1}>
                  <SafeMarkdown markdown={d.markdown} />
                </div>
              </div>
            </div>
          </div>
        );
      })}
      <p className="cat-hint">{tx("Marque só se o formulário de inscrição trazia esta autorização e as famílias aceitaram. Vale para todas as crianças desta planilha.")}</p>
    </fieldset>
  );
}
