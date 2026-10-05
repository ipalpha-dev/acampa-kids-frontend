import { useEffect, useState } from "react";
import { addResponsible, type Responsible } from "../../api/campers";
import Dialog from "../../components/Dialog";
import ParentIcon from "../../components/ParentIcon";
import PhoneInput from "../../components/PhoneInput";
import { toE164 } from "../../phone";
import { useI18n } from "../../i18n";

interface CamperResponsibleDialogProps {
  token: string;
  open: boolean;
  camperId: string;
  /** the kid's live name */
  camperName: string;
  onClose: () => void;
  /** the new responsável, once linked in IPAlpha */
  onAdded: (responsible: Responsible) => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The coordenação adds one more responsável to a kid (decision 38): the
 * person is registered (or found) in IPAlpha and linked to the SAME child.
 * Copy stays about care — "quem também cuida" — never about family shape.
 */
export default function CamperResponsibleDialog({ token, open, camperId, camperName, onClose, onAdded }: CamperResponsibleDialogProps) {
  const { tx } = useI18n();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setPhone("");
    setEmail("");
    setError(null);
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
      const res = await addResponsible(token, camperId, { name: name.trim(), phone: e164!, ...(email.trim() ? { email: email.trim().toLowerCase() } : {}) });
      onAdded(res.responsible);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : tx("Algo deu errado."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={tx("Adicionar outro responsável")} width={520} dismissible={!busy} className="sheet-dialog">
      <form className="cat-form cat-form--plain" onSubmit={submit}>
        <span className="sheet__handle" aria-hidden="true" />
        <h2 className="cat-form__title">
          <ParentIcon size={24} /> {tx("Mais alguém cuida de {name}?", { name: first })}
        </h2>
        <p className="cat-hint">{tx("Esta pessoa também fica como responsável pela mesma criança no IPAlpha e poderá acompanhá-la no Acampa.")}</p>
        <label className="cat-field cat-field--grow">
          <span className="cat-field__label">{tx("Nome do responsável")}</span>
          <input className="cat-input" value={name} maxLength={100} autoFocus disabled={busy} placeholder={tx("ex.: Daniela Sparvoli")} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="cat-field cat-field--grow">
          <span className="cat-field__label">{tx("Celular do responsável")}</span>
          <PhoneInput value={phone} onChange={setPhone} disabled={busy} />
          {phone && !e164 && <p className="cat-hint cat-hint--error">{tx("Informe um celular válido com DDD.")}</p>}
        </div>
        <label className="cat-field cat-field--grow">
          <span className="cat-field__label">{tx("E-mail (opcional)")}</span>
          <input className="cat-input" type="email" inputMode="email" value={email} maxLength={160} disabled={busy} placeholder={tx("ex.: nome@email.com")} onChange={(e) => setEmail(e.target.value)} />
          {!emailOk && <p className="cat-hint cat-hint--error">{tx("Confira o e-mail.")}</p>}
        </label>
        {error && <p className="message message--error">{error}</p>}
        <div className="cat-form__actions">
          <button type="button" className="button button--secondary" onClick={onClose} disabled={busy}>
            {tx("Cancelar")}
          </button>
          <button type="submit" className="button button--primary" disabled={!valid || busy}>
            {busy ? tx("Salvando…") : tx("Adicionar")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
