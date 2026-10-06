import { useState } from "react";
import Dialog from "./Dialog";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { ICONS } from "../icons";
import { useI18n } from "../i18n";

/**
 * The drag-and-drop boards ("Montar quartos", "Ônibus") are cramped on a
 * phone: on first open on a small screen we gently suggest doing this on a
 * computer. It never blocks — one tap dismisses it for the rest of the visit.
 */
export default function DesktopBoardNotice({ what, icon = ICONS.desktopBetter }: { what: string; icon?: string }) {
  const { tx } = useI18n();
  const isPhone = useMediaQuery("(max-width: 760px)");
  const [dismissed, setDismissed] = useState(false);
  const open = isPhone && !dismissed;

  return (
    <Dialog open={open} onClose={() => setDismissed(true)} title={tx("Melhor no computador")} width={420}>
      <div className="cat-form cat-form--plain desktop-notice">
        <img className="desktop-notice__img" src={icon} alt="" aria-hidden="true" />
        <h2 className="cat-form__title">{tx("Melhor no computador")}</h2>
        <p className="cat-hint">
          {tx("Arrastar e soltar para {what} funciona", { what })} <strong>{tx("muito melhor")}</strong>{" "}
          {tx("num computador, com a tela grande. Dá para usar aqui no celular, mas é bem mais apertado.")}
        </p>
        <div className="cat-form__actions">
          <button type="button" className="button button--primary" onClick={() => setDismissed(true)}>
            {tx("Continuar mesmo assim")}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
