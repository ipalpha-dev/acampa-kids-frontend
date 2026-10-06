import { useState } from "react";
import { resetForeignLookups } from "../../api/settings";
import { useConfirm } from "../../components/ConfirmDialog";
import { useCollection } from "../../store";
import { useNames } from "../../store/people";
import { useI18n } from "../../i18n";

interface ForeignLookupsCardProps {
  token: string;
}

/**
 * Settings → Geral: staff who scanned ≥3 kids outside their scope via the
 * emergency QR FAB. Hidden while the list is empty (nobody at the threshold).
 * "Zerar contadores" unblocks anyone at ≥5 and clears the SMS-alert mark.
 */
export default function ForeignLookupsCard({ token }: ForeignLookupsCardProps) {
  const { tx, te } = useI18n();
  const settings = useCollection("settings");
  const offenders = settings?.foreignLookupOffenders ?? [];
  const nameOf = useNames(offenders.flatMap((o) => [o.personId, ...o.camperIds]));
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!settings || offenders.length === 0) return null;

  async function reset() {
    if (busy) return;
    if (
      !(await confirm({
        title: tx("Zerar contadores?"),
        message: tx("Isso zera o contador de todo mundo (e libera quem estava bloqueado). O histórico de leituras continua no servidor para auditoria."),
        confirmLabel: tx("Zerar"),
        emoji: "🔍",
      }))
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await resetForeignLookups(token);
    } catch (e) {
      setError(te(e, "Algo deu errado."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="cat-form">
      <div className="cat-form__head">
        <h2 className="cat-form__title">{tx("🔍 Leituras fora do escopo")}</h2>
        <button type="button" className="button button--secondary" disabled={busy} onClick={() => void reset()}>
          {tx("Zerar contadores")}
        </button>
      </div>
      <p className="cat-hint">
        {tx("Pessoas da equipe que leram")} <strong>{tx("3 ou mais")}</strong> {tx("crianças que não são do quarto delas pelo botão de busca.")}
        {" "}
        {tx("A partir de 3 a coordenação recebe um SMS; a partir de 5 o acesso a crianças de fora fica bloqueado até zerar.")}
      </p>
      <ul className="foreign-lookup-list">
        {offenders.map((o) => (
          <li key={o.personId} className={`foreign-lookup-list__item ${o.blocked ? "foreign-lookup-list__item--blocked" : ""}`}>
            <div>
              <strong>{nameOf(o.personId) || tx("Carregando nome…")}</strong>
              <span className="foreign-lookup-list__count">
                {o.count === 1
                  ? tx("{n} criança", { n: o.count })
                  : tx("{n} crianças", { n: o.count })}
                {o.blocked ? tx(" · bloqueado") : ""}
              </span>
            </div>
            {o.camperIds.length > 0 && <p className="foreign-lookup-list__names">{o.camperIds.map((id) => nameOf(id)).filter(Boolean).join(", ")}</p>}
          </li>
        ))}
      </ul>
      {error && <p className="message message--error">{error}</p>}
    </section>
  );
}
