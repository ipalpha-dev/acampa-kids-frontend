import { useEffect, useMemo, useState } from "react";
import { aiUsage, type AiKindUsage, type AiVendor, type AiVendorUsage, type SmsUsage } from "../../api/ai";
import { estimateCostUsd, usd } from "../../aiCost";
import AiVendorLogo from "../../components/AiVendorLogo";
import { AiGlyph } from "../../components/Glyph";
import { speakStamp } from "../../dates";
import { useI18n } from "../../i18n";
import { useUsdtBrl } from "../../usdtRate";
import styles from "./data.module.scss";

interface AboutPageProps {
  token: string;
}

const VENDOR_NAMES: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  // the real OpenAI API (voice assistant), billed directly — not the gateway's GPT models above
  openai_api: "OpenAI API",
  xai: "xAI",
  meta: "Meta",
  zhipu: "Zhipu AI",
  google: "Google",
  alibaba: "Alibaba",
  typesafe: "TypeSafe AI",
};

/** slice colour per lab / per request kind: a tone class of data.module.scss (palette lives in SCSS) */
const VENDOR_TONES = new Set(["anthropic", "openai", "openai_api", "xai", "meta", "zhipu", "google", "alibaba", "typesafe"]);

/** the kinds of AI request the backend records (AiUsageEntry.kind) */
const KIND_LABELS: Record<string, string> = {
  edit: "Assistente de texto",
  suggest: "Sugestões",
  image: "Ilustrações",
  camper_notes: "Triagem de ficha",
  structure_health: "Saúde estruturada",
  normalize_observations: "Limpeza das observações",
  dedup_field: "Limpeza",
  guess_sex: "Sexo pelo nome",
  assistant_chat: "Assistente escrito",
  assistant_voice: "Assistente por voz",
};
const KIND_TONES = new Set(Object.keys(KIND_LABELS));

/** module class of a tone key ("vendor-anthropic", "kind-edit"…); unknown keys fall back to the muted tone */
function toneClass(prefix: "vendor" | "kind", key: string): string {
  const known = prefix === "vendor" ? VENDOR_TONES.has(key) : KIND_TONES.has(key);
  return styles[known ? `${prefix}-${key}` : "tone-muted"] ?? "";
}

/**
 * Backup format of backend/scripts/backup.ts — keep both numbers in sync.
 * v3 = people live in IPAlpha: a backup holds camp operations only (never
 * sessions, sign-ins in flight nor person data) and only v3 files restore.
 */
const BACKUP_VERSION = 3;

interface Slice {
  label: string;
  /** tone class (see toneClass) */
  tone: string;
  value: number;
}

/** Donut chart: one slice per lab, total in the middle, legend beside it. Hovering a slice (or its legend row) highlights the pair. */
function PieChart({ title, slices, total, format }: { title: string; slices: Slice[]; total: number; format: (v: number) => string }) {
  const [hot, setHot] = useState<string | null>(null);
  const known = slices.filter((s) => s.value > 0);
  let acc = 0;
  const segs = known.map((s) => {
    const pct = total ? (s.value / total) * 100 : 0;
    const seg = { ...s, from: acc, pct };
    acc += pct;
    return seg;
  });
  const active = hot ? segs.find((s) => s.label === hot) ?? null : null;
  return (
    <figure className="about-pie">
      <figcaption>{title}</figcaption>
      <div className={`about-pie__chart${hot ? " is-hot" : ""}`}>
        <svg viewBox="0 0 42 42" role="img" aria-label={title}>
          <circle className="about-pie__ring" cx="21" cy="21" r="15.9155" />
          {segs.map((s) => (
            <circle
              key={s.label}
              className={`about-pie__slice ${styles.slice} ${s.tone}${hot === s.label ? " is-hot" : ""}`}
              cx="21"
              cy="21"
              r="15.9155"
              strokeDasharray={`${s.pct} ${100 - s.pct}`}
              strokeDashoffset={25 - s.from}
              onMouseEnter={() => setHot(s.label)}
              onMouseLeave={() => setHot(null)}
            />
          ))}
        </svg>
        <span className="about-pie__center">
          {active ? (
            <>
              <b>{format(active.value)}</b>
              <i>
                {active.label} · {Math.round(active.pct)}%
              </i>
            </>
          ) : (
            <b>{format(total)}</b>
          )}
        </span>
      </div>
      <ul className="about-pie__legend">
        {known.map((s) => (
          <li
            key={s.label}
            className={hot === s.label ? "is-hot" : undefined}
            onMouseEnter={() => setHot(s.label)}
            onMouseLeave={() => setHot(null)}
          >
            <span className={`about-pie__dot ${styles.dot} ${s.tone}`} />
            <span className="about-pie__name">{s.label}</span>
            <span className="about-pie__val">{format(s.value)}</span>
            <span className="about-pie__pct">{total ? Math.round((s.value / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/** Admin-only "Sobre": app version and how much each AI company has been used. */
export default function AboutPage({ token }: AboutPageProps) {
  const { tx, tag, te } = useI18n();
  const [vendors, setVendors] = useState<AiVendorUsage[] | null>(null);
  const [kinds, setKinds] = useState<AiKindUsage[] | null>(null);
  const [sms, setSms] = useState<SmsUsage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const usdtBrl = useUsdtBrl();

  const num = useMemo(() => new Intl.NumberFormat(tag), [tag]);
  const brl = useMemo(() => new Intl.NumberFormat(tag, { style: "currency", currency: "BRL" }), [tag]);
  const brlPlain = useMemo(() => new Intl.NumberFormat(tag, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), [tag]);

  useEffect(() => {
    let cancelled = false;
    aiUsage(token)
      .then((r) => {
        if (cancelled) return;
        setVendors(r.vendors);
        setKinds(r.kinds);
        setSms(r.sms ?? null);
      })
      .catch((e) => !cancelled && setError(te(e, "Não foi possível carregar o uso de IA.")));
    return () => {
      cancelled = true;
    };
  }, [token, tx]);

  /** per lab (not per model): tokens + estimated cost */
  const rows = useMemo(
    () =>
      (vendors ?? []).map((v) => ({
        ...v,
        name: VENDOR_NAMES[v.vendor] ?? v.vendor,
        tone: toneClass("vendor", v.vendor),
        tokens: v.promptTokens + v.completionTokens,
        cost: v.models.reduce((n, m) => n + (estimateCostUsd(m.model, m.promptTokens, m.completionTokens) ?? 0), 0),
      })),
    [vendors],
  );

  const totalCalls = rows.reduce((n, v) => n + v.calls, 0);
  const totalTokens = rows.reduce((n, v) => n + v.tokens, 0);
  const totalCost = rows.reduce((n, v) => n + v.cost, 0);

  /** BRL at the live USDT rate; US$ until the rate arrives */
  const fmtCost = (v: number) => (usdtBrl != null ? brl.format(v * usdtBrl) : usd.format(v));

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
            <dt>{tx("Chamadas de IA")}</dt>
            <dd>{vendors ? num.format(totalCalls) : "…"}</dd>
          </div>
          <div>
            <dt>{tx("Tokens")}</dt>
            <dd>{vendors ? num.format(totalTokens) : "…"}</dd>
          </div>
          <div>
            <dt>{tx("Custo estimado")}</dt>
            <dd>{vendors ? fmtCost(totalCost) : "…"}</dd>
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
        <p className="cat-hint">
          {tx("Só cópias no formato v{n} podem ser restauradas. Elas guardam apenas a operação do acampamento — nunca sessões nem dados pessoais, que ficam no IPAlpha.", { n: BACKUP_VERSION })}
        </p>
      </section>

      <section className="cat-form">
        <h2 className="cat-form__title"><AiGlyph /> {tx("Uso de IA por empresa")}</h2>
        <p className="cat-hint">
          {usdtBrl != null
            ? tx(
                "Assistente do editor e sugestões de título/emoji, somados desde o início. Custo estimado pela tabela do gateway, em reais pela cotação do USDT de R$ {n} (cross-otc.com).",
                { n: brlPlain.format(usdtBrl) },
              )
            : tx(
                "Assistente do editor e sugestões de título/emoji, somados desde o início. Custo estimado pela tabela do gateway, em reais pela cotação do USDT (cross-otc.com).",
              )}
        </p>
        {error && <p className="message message--error">{error}</p>}
        {!error && !vendors && <p className="opt-empty">{tx("Carregando…")}</p>}
        {vendors && !vendors.length && <p className="opt-empty">{tx("Ninguém usou a IA ainda.")}</p>}
        {rows.length > 0 && (
          <>
            <div className="about-pies">
              <PieChart title={tx("Tokens por empresa")} slices={rows.map((r) => ({ label: r.name, tone: r.tone, value: r.tokens }))} total={totalTokens} format={num.format} />
              {totalCost > 0 && (
                <PieChart title={tx("Custo por empresa")} slices={rows.map((r) => ({ label: r.name, tone: r.tone, value: r.cost }))} total={totalCost} format={fmtCost} />
              )}
              <PieChart title={tx("Chamadas por empresa")} slices={rows.map((r) => ({ label: r.name, tone: r.tone, value: r.calls }))} total={totalCalls} format={num.format} />
              {kinds && kinds.length > 0 && (
                <PieChart
                  title={tx("Chamadas por pedido")}
                  slices={kinds.map((k) => ({
                    label: KIND_LABELS[k.kind] ? tx(KIND_LABELS[k.kind]) : k.kind,
                    tone: toneClass("kind", k.kind),
                    value: k.calls,
                  }))}
                  total={totalCalls}
                  format={num.format}
                />
              )}
            </div>
            <ul className="about-vendors">
              {rows.map((v) => (
                <li key={v.vendor} className="about-vendor">
                  <div className="about-vendor__head">
                    <AiVendorLogo vendor={v.vendor as AiVendor} size={22} />
                    <span className="about-vendor__name">{v.name}</span>
                    <span className="about-vendor__cost">{fmtCost(v.cost)}</span>
                  </div>
                  <div className="about-vendor__stats">
                    <span>
                      <b>{num.format(v.calls)}</b> {tx("chamadas")}
                      {v.errors ? ` · ${num.format(v.errors)} ${tx("falhas")}` : ""}
                    </span>
                    <span>
                      <b>{num.format(v.tokens)}</b> {tx("tokens")} ({num.format(v.promptTokens)} {tx("entrada")} · {num.format(v.completionTokens)} {tx("saída")})
                    </span>
                    {v.lastAt && <span>{tx("último uso {when}", { when: speakStamp(v.lastAt) })}</span>}
                  </div>
                  <ul className="about-vendor__models">
                    {v.models.map((m) => {
                      const cost = estimateCostUsd(m.model, m.promptTokens, m.completionTokens);
                      return (
                        <li key={m.model}>
                          <code>{m.model}</code> — {num.format(m.calls)} {tx("chamadas")} · {num.format(m.promptTokens + m.completionTokens)} {tx("tokens")}
                          {cost != null && ` · ≈ ${fmtCost(cost)}`}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
