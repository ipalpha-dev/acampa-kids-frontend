import { useEffect, useMemo, useState } from "react";
import { aiUsage, type SmsUsage } from "../../api/ai";
import { AiGlyph } from "../../components/Glyph";
import { useI18n } from "../../i18n";

interface AboutPageProps {
  token: string;
}

/**
 * Backup format of backend/scripts/backup.ts — keep both numbers in sync.
 * v3 = people live in IPAlpha: a backup holds camp operations only (never
 * sessions, sign-ins in flight nor person data) and only v3 files restore.
 */
const BACKUP_VERSION = 3;

/** Admin-only "Sobre": app version, backup format and the SMS counter. The AI cost lives in Oikos (core ai-api). */
export default function AboutPage({ token }: AboutPageProps) {
  const { tx, tag, te } = useI18n();
  const [sms, setSms] = useState<SmsUsage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const num = useMemo(() => new Intl.NumberFormat(tag), [tag]);
  const brl = useMemo(() => new Intl.NumberFormat(tag, { style: "currency", currency: "BRL" }), [tag]);

  useEffect(() => {
    let cancelled = false;
    aiUsage(token)
      .then((r) => {
        if (!cancelled) setSms(r.sms ?? null);
      })
      .catch((e) => !cancelled && setError(te(e, "Não foi possível carregar o uso de SMS.")));
    return () => {
      cancelled = true;
    };
  }, [token, te]);

  return (
    <div className="admin-page">
      <header className="admin-head">
        <h1 className="admin-title">ℹ️ {tx("Sobre")}</h1>
      </header>

      <section className="cat-form">
        <h2 className="cat-form__title">{tx("🏕️ Acampamento Kids")}</h2>
        <dl className="about-facts">
          <div>
            <dt>{tx("Versão")}</dt>
            <dd>{__APP_VERSION__}</dd>
          </div>
          <div>
            <dt>{tx("Backup")}</dt>
            <dd>v{BACKUP_VERSION}</dd>
          </div>
          <div>
            <dt>{tx("SMS enviados")}</dt>
            <dd>{sms ? num.format(sms.sent) : "…"}</dd>
          </div>
          <div>
            <dt>{tx("Custo de SMS")}</dt>
            <dd>{sms ? brl.format(sms.costBrl) : "…"}</dd>
          </div>
        </dl>
        {error && <p className="message message--error">{error}</p>}
        <p className="cat-hint">
          {tx("Só cópias no formato v{n} podem ser restauradas. Elas guardam apenas a operação do acampamento — nunca sessões nem dados pessoais, que ficam no IPAlpha.", { n: BACKUP_VERSION })}
        </p>
      </section>

      <section className="cat-form">
        <h2 className="cat-form__title"><AiGlyph /> {tx("Uso de IA")}</h2>
        <p className="cat-hint">{tx("A IA do Acampa passa pelo IPAlpha. O uso e o custo aparecem no Oikos, junto com o limite mensal do aplicativo.")}</p>
      </section>
    </div>
  );
}
