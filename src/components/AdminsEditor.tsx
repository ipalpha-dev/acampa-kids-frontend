import { useEffect, useState } from "react";
import { listAdmins, type AdminsInfo } from "../api/admins";
import { useI18n } from "../i18n";
import type { LoggedUser } from "../roles";

interface AdminsEditorProps {
  token: string;
  user: LoggedUser;
}

/**
 * Who coordinates the camp (setup wizard's step and the Superusuário page).
 * Read-only: the `coordenacao` role is granted in Mordomia (IPAlpha), where
 * every role of the project lives — this only shows the current list.
 */
export default function AdminsEditor({ token, user }: AdminsEditorProps) {
  const { tx, te } = useI18n();
  const [info, setInfo] = useState<AdminsInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listAdmins(token)
      .then((res) => alive && setInfo(res))
      .catch((err) => alive && setError(te(err, "Algo deu errado.")));
    return () => {
      alive = false;
    };
  }, [token, tx]);

  const copyLink = async () => {
    if (!info?.appUrl) return;
    try {
      await navigator.clipboard.writeText(info.appUrl);
    } catch {
      // clipboard refused: the link is on screen anyway
    }
  };

  return (
    <div className="admins-list">
      {error && <p className="message message--error">{error}</p>}
      {!info && !error && <p className="cat-hint">{tx("Carregando…")}</p>}
      {info && (
        <ul className="wizard-admins">
          {info.admins.map((a) => (
            <li key={a.personId} className="wizard-admins__row">
              <span className="wizard-admins__name">
                {a.name || tx("Nome indisponível no momento")} {a.personId === user.personId && <span className="cat-hint">{tx("(você)")}</span>}
                {a.superAdmin && <span className="cat-hint"> {tx("· admin da implantação")}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="cat-hint">{tx("Quem serve na coordenação é definido no IPAlpha (Mordomia → Projetos → Acampa Kids → Papéis).")}</p>
      {info?.appUrl && (
        <div className="cat-form__actions">
          <button type="button" className="button button--secondary" onClick={() => void copyLink()}>
            {tx("Copiar link do app")}
          </button>
        </div>
      )}
    </div>
  );
}
