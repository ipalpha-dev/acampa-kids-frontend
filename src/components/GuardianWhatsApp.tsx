import { useState } from "react";
import type { Camper } from "../api/campers";
import { phoneOf } from "../api/people";
import { loadAuth } from "../auth/store";
import { useCamperResponsibles, usePersonData } from "../hooks/usePersonData";
import { useI18n } from "../i18n";
import { staffGreeting, whatsappLink } from "../whatsapp";
import WhatsAppButton from "./WhatsAppButton";

interface GuardianWhatsAppProps {
  camper: Pick<Camper, "id" | "name">;
  /** class of the WhatsApp button(s) once the contact is read */
  className?: string;
}

/**
 * Talk to a kid's family on WhatsApp. Contacts are never in the records: the
 * responsáveis (names only — GET /api/campers/:id/responsibles, no health) and
 * then each one's phone are read from IPAlpha only when someone taps (core's
 * role rules decide; each read is logged for the person — LGPD).
 */
export default function GuardianWhatsApp({ camper: k, className = "wa-btn--sm" }: GuardianWhatsAppProps) {
  const { tx } = useI18n();
  const token = loadAuth()?.token ?? "";
  const [asked, setAsked] = useState(false);
  const live = useCamperResponsibles(token, asked && token ? k.id : null);

  if (!asked) {
    const label = tx("Falar com a família de {name}", { name: k.name.split(" ")[0] || tx("a criança") });
    return (
      <button
        type="button"
        className="icon-btn guardian-contact__ask"
        title={label}
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation();
          setAsked(true);
        }}
      >
        📞
      </button>
    );
  }
  if (live.loading || (!live.data && !live.error)) return <span className="cat-hint person-contact__loading">{tx("Carregando…")}</span>;
  const responsibles = live.data?.responsibles ?? [];
  if (live.error || responsibles.length === 0) return <span className="cat-hint">{live.error ? tx("Não foi possível ver o contato agora.") : tx("Nenhum responsável visível.")}</span>;
  return (
    <span className="person-contact">
      {responsibles.map((r) => (
        <ResponsibleWhatsApp key={r.personId} token={token} personId={r.personId} name={r.name} about={live.data?.camper.name || k.name} className={className} />
      ))}
    </span>
  );
}

function ResponsibleWhatsApp({ token, personId, name, about, className }: { token: string; personId: string; name: string; about: string; className: string }) {
  const { tx } = useI18n();
  const phone = usePersonData(token, personId, "phone");
  const e164 = phoneOf(phone.data);
  if (phone.loading) return <span className="cat-hint person-contact__loading">{tx("Carregando…")}</span>;
  if (!e164) return null;
  const first = name.split(" ")[0];
  return (
    <WhatsAppButton
      className={className}
      href={whatsappLink(e164, staffGreeting({ toName: name, fromName: loadAuth()?.user.name ?? "", about }))}
      label={first ? tx("Falar com {name} no WhatsApp", { name: first }) : tx("Falar com o responsável no WhatsApp")}
    />
  );
}
