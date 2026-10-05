import { useEffect, useState } from "react";
import { ApiError } from "../../api/client";
import { proposeLinkRequest } from "../../api/linkRequests";
import Dialog from "../../components/Dialog";
import ParentIcon from "../../components/ParentIcon";
import PhoneInput from "../../components/PhoneInput";
import { toE164 } from "../../phone";
import { useI18n } from "../../i18n";
import styles from "./LinkRequestDialog.module.scss";

interface LinkRequestDialogProps {
  token: string;
  open: boolean;
  camperId: string;
  /** the kid's live name */
  camperName: string;
  onClose: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Tx = (pt: string, vars?: Record<string, string | number>) => string;

/** core's refusals (CONTRACTS §25), said gently */
export function linkRequestErrorMessage(tx: Tx, err: unknown): string {
  if (!(err instanceof ApiError)) return tx("Algo deu errado. Tente novamente.");
  switch (err.reason ?? err.code) {
    case "alreadyLinked":
      return tx("Esta pessoa já é responsável por esta criança.");
    case "requestPending":
      return tx("Já existe um pedido para esta pessoa esperando a resposta da família.");
    case "noCurrentResponsible":
      return tx("Esta criança ainda não tem um responsável para aceitar o pedido. Fale com quem cuida do IPAlpha.");
    case "cannotLinkSelf":
      return tx("Você não pode pedir para incluir a si mesmo.");
    case "notAMinor":
    case "missingBirthDate":
      return tx("O IPAlpha só liga responsáveis a crianças com data de nascimento e menores de 18 anos.");
    case "outsideWindow":
      return tx("O período de inscrições desta edição está fechado no IPAlpha.");
    case "noGrant":
    case "roleNotHeld":
    case "COORDINATION_REQUIRED":
      return tx("Só a coordenação pode pedir para incluir outro responsável.");
    case "RESPONSIBLE_INVALID":
      return tx("Informe o nome e o celular do responsável.");
    case "EMAIL_INVALID":
      return tx("Confira o e-mail.");
    case "OFFLINE":
      return tx("Sem conexão com o servidor. Verifique a internet e tente de novo.");
    case "IPALPHA_UNAVAILABLE":
      return tx("O IPAlpha está em manutenção agora. Tente de novo daqui a pouco.");
    default:
      return tx("O IPAlpha não criou este pedido agora. Tente de novo.");
  }
}

/**
 * The coordenação asks to include one more responsável for a kid (decision 80):
 * the person is registered (or found) in IPAlpha WITHOUT any link, and the
 * family decides. Copy stays about care — "quem também cuida" — never about
 * family shape, and never ranks one responsável over another.
 */
export default function LinkRequestDialog({ token, open, camperId, camperName, onClose }: LinkRequestDialogProps) {
  const { tx } = useI18n();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName("");
    setPhone("");
    setEmail("");
    setError(null);
    setSent(false);
  }, [open]);

  const e164 = toE164(phone);
  const emailOk = !email.trim() || EMAIL_RE.test(email.trim());
  const valid = name.trim().length > 1 && !!e164 && emailOk;
  const first = camperName.split(" ")[0] || tx("a criança");

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await proposeLinkRequest(token, { camperId, name: name.trim(), phone: e164!, ...(email.trim() ? { email: email.trim().toLowerCase() } : {}) });
      setSent(true);
    } catch (err) {
      setError(linkRequestErrorMessage(tx, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={tx("Adicionar outro responsável")} dismissible={!busy} className="sheet-dialog">
      <span className="sheet__handle" aria-hidden="true" />
      <div key={sent ? "sent" : "form"} className={styles.step}>
        {sent ? (
          <div className="cat-form cat-form--plain" role="status">
            <h2 className="cat-form__title">
              <ParentIcon size={24} /> {tx("Pedido enviado")}
            </h2>
            <p className="cat-hint">{tx("A família de {name} vai ver o pedido no Acampa Kids e no IPAlpha. Quando um responsável aceitar, {person} também passa a cuidar de {name} por aqui. O pedido vale por 30 dias.", { name: first, person: name.trim().split(" ")[0] })}</p>
            <div className="cat-form__actions">
              <button type="button" className="button button--primary" onClick={onClose}>
                {tx("Fechar")}
              </button>
            </div>
          </div>
        ) : (
          <form className="cat-form cat-form--plain" onSubmit={submit}>
            <h2 className="cat-form__title">
              <ParentIcon size={24} /> {tx("Mais alguém cuida de {name}?", { name: first })}
            </h2>
            <p className="cat-hint">{tx("Vamos pedir à família de {name}: quando um responsável aceitar, esta pessoa também passa a cuidar de {name} no IPAlpha e no Acampa Kids. Nada é compartilhado antes disso.", { name: first })}</p>
            <label className="cat-field cat-field--grow">
              <span className="cat-field__label">{tx("Nome do responsável")}</span>
              <input className="cat-input" value={name} maxLength={100} disabled={busy} placeholder={tx("ex.: Daniela Sparvoli")} onChange={(e) => setName(e.target.value)} />
            </label>
            <div className="cat-field cat-field--grow">
              <span className="cat-field__label">{tx("Celular do responsável")}</span>
              <PhoneInput value={phone} onChange={setPhone} disabled={busy} />
              <div className={`${styles.reveal} ${phone && !e164 ? styles.revealOpen : ""}`}>
                <p className={`cat-hint cat-hint--error ${styles.revealInner}`}>{tx("Informe um celular válido com DDD.")}</p>
              </div>
            </div>
            <label className="cat-field cat-field--grow">
              <span className="cat-field__label">{tx("E-mail (opcional)")}</span>
              <input className="cat-input" type="email" inputMode="email" value={email} maxLength={160} disabled={busy} placeholder={tx("ex.: nome@email.com")} onChange={(e) => setEmail(e.target.value)} />
              <span className={`${styles.reveal} ${emailOk ? "" : styles.revealOpen}`}>
                <span className={`cat-hint cat-hint--error ${styles.revealInner}`}>{tx("Confira o e-mail.")}</span>
              </span>
            </label>
            <div className={`${styles.reveal} ${error ? styles.revealOpen : ""}`} aria-live="polite">
              <p className={`message message--error ${styles.revealInner}`}>{error}</p>
            </div>
            <div className="cat-form__actions">
              <button type="button" className="button button--secondary" onClick={onClose} disabled={busy}>
                {tx("Cancelar")}
              </button>
              <button type="submit" className="button button--primary" disabled={!valid || busy}>
                {busy ? tx("Enviando…") : tx("Enviar pedido")}
              </button>
            </div>
          </form>
        )}
      </div>
    </Dialog>
  );
}
