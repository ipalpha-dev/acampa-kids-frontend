import { useState } from "react";
import { phoneOf } from "../api/people";
import { loadAuth } from "../auth/store";
import { usePersonData } from "../hooks/usePersonData";
import { useI18n } from "../i18n";
import { formatBrazilPhoneClient } from "../phoneFormat";
import { staffGreeting, whatsappLink } from "../whatsapp";
import WhatsAppButton from "./WhatsAppButton";

interface PersonContactProps {
  token: string;
  personId: string;
  /** the person's (live) name, for the WhatsApp greeting */
  name: string;
  /** the kid the conversation is about (guardian contact) */
  about?: string;
  /** compact: only the WhatsApp / call buttons once loaded */
  compact?: boolean;
}

/**
 * A person's phone, read from IPAlpha ONLY when someone taps "Ver contato"
 * (core's role rules decide; the read is logged for that person — LGPD).
 * Nothing is kept: closing the screen forgets it.
 */
export default function PersonContact({ token, personId, name, about, compact }: PersonContactProps) {
  const { tx } = useI18n();
  const [asked, setAsked] = useState(false);
  const phone = usePersonData(token, personId, "phone", asked);
  const e164 = phoneOf(phone.data);

  if (!asked) {
    return (
      <button type="button" className="button button--secondary button--small person-contact__ask" onClick={() => setAsked(true)}>
        📞 {tx("Ver contato")}
      </button>
    );
  }
  if (phone.loading) return <span className="cat-hint person-contact__loading">{tx("Carregando…")}</span>;
  if (phone.error || !e164) return <span className="cat-hint">{phone.error ? tx("Não foi possível ver o contato agora.") : tx("Sem celular cadastrado.")}</span>;
  const myName = loadAuth()?.user.name ?? "";
  return (
    <span className="person-contact">
      {!compact && <a className="person-contact__phone" href={`tel:${e164}`}>{formatBrazilPhoneClient(e164)}</a>}
      <WhatsAppButton className="wa-btn--sm" href={whatsappLink(e164, staffGreeting({ toName: name, fromName: myName, about: about ?? "" }))} label={tx("Falar com {name} no WhatsApp", { name: name.split(" ")[0] || tx("a pessoa") })} />
    </span>
  );
}
