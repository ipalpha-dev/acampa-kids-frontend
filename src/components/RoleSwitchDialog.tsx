import { useState } from "react";
import Dialog from "./Dialog";
import { ICONS } from "../icons";
import { useI18n } from "../i18n";
import { roleMeta, sortRoles, type CoreRole, type LoggedUser } from "../roles";

interface RoleSwitchDialogProps {
  open: boolean;
  /** the person settled for the profile the login already picked */
  onClose: () => void;
  user: LoggedUser;
  /** enters `role` instead (a fresh token, no new SMS) */
  onSwitch: (role: CoreRole) => Promise<void>;
}

/**
 * The same person may hold more than one profile (a mother who is also on the
 * team). The login lands on the highest-priority one, so this stands BETWEEN
 * the SMS code and the app to let them say otherwise: a big card per profile
 * with its paper-cut icon, and no new SMS — the server just re-issues the
 * session for the role chosen. There is no way out but picking one.
 *
 * Changing profile LATER is a plain chip on the profile page (one tap, no
 * dialog) — see pages/Dashboard#ProfileView and pages/parent/ParentProfile.
 */
export default function RoleSwitchDialog({ open, onClose, user, onSwitch }: RoleSwitchDialogProps) {
  const { tx, t, te } = useI18n();
  const [busy, setBusy] = useState<CoreRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const current = user.activeRole;

  async function pick(role: CoreRole) {
    if (busy) return;
    // the session already IS this role: nothing to ask the server for
    if (role === current) return onClose();
    setBusy(role);
    setError(null);
    try {
      await onSwitch(role);
    } catch (err) {
      setError(te(err, "Não foi possível entrar com este perfil."));
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} width={520} title={tx("Escolha o perfil")} dismissible={false}>
      <div className="role-switch">
        <div className="role-switch__sky" aria-hidden="true">
          <img className="role-switch__emoji" src={ICONS.badge} alt="" />
        </div>
        <div className="role-switch__body">
          <h2 className="role-switch__title">{t("login.chooseProfile")}</h2>
          <p className="role-switch__text">{tx("Você tem mais de um perfil no acampamento.")}</p>

          {error && <p className="message message--error">{error}</p>}

          <ul className="role-switch__list">
            {sortRoles(user.roles).map((role) => {
              const meta = roleMeta(role);
              return (
                <li key={role}>
                  <button
                    type="button"
                    className={`role-switch__option role-switch__option--${meta.color}`}
                    aria-current={role === current ? "true" : undefined}
                    disabled={!!busy}
                    onClick={() => pick(role)}
                  >
                    <img className="role-switch__icon" src={meta.icon} alt="" aria-hidden="true" />
                    <span className="role-switch__option-body">
                      <span className="role-switch__option-label">{tx(meta.label)}</span>
                      <span className="role-switch__option-hint">{busy === role ? tx("entrando…") : tx(meta.description)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </Dialog>
  );
}
