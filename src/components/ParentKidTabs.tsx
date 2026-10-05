import KidIcon from "./KidIcon";
import { kidIconSex } from "../icons";
import { useI18n } from "../i18n";
import type { MyKid } from "../store/derive";

interface ParentKidTabsProps {
  kids: MyKid[];
  selectedId: string;
  onSelect: (id: string) => void;
  /** prefix of the tab ids, so two tab strips can live on the same page */
  idPrefix: string;
  /** id of the panel the tabs control */
  panelId: string;
}

/**
 * The strip a responsible uses to switch between their kids (Início and
 * Perfil). Renders nothing for a single kid — there would be nothing to
 * choose. Arrow keys / Home / End move the selection, as a tablist should.
 */
export default function ParentKidTabs({ kids, selectedId, onSelect, idPrefix, panelId }: ParentKidTabsProps) {
  const { tx } = useI18n();
  if (kids.length < 2) return null;

  const tabId = (id: string) => `${idPrefix}-${id}`;
  /** the name comes live from IPAlpha: "…" until it arrives, never a blank tab */
  const firstName = (name: string) => name.trim().split(/\s+/)[0] || "…";
  const surname = (name: string) => name.trim().split(/\s+/).slice(1).join(" ");

  return (
    <nav className="parent-kid-tabs" role="tablist" aria-label={tx("Escolha uma criança")}>
      {kids.map((kid) => {
        const active = kid.camper.id === selectedId;
        return (
          <button
            key={kid.camper.id}
            id={tabId(kid.camper.id)}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={panelId}
            tabIndex={active ? 0 : -1}
            title={kid.camper.name || undefined}
            className={`parent-kid-tab ${active ? "parent-kid-tab--active" : ""}`}
            onClick={() => onSelect(kid.camper.id)}
            onKeyDown={(event) => {
              const index = kids.findIndex((item) => item.camper.id === kid.camper.id);
              const last = kids.length - 1;
              const nextIndex = event.key === "ArrowRight" ? (index + 1) % kids.length
                : event.key === "ArrowLeft" ? (index - 1 + kids.length) % kids.length
                  : event.key === "Home" ? 0
                    : event.key === "End" ? last
                      : null;
              if (nextIndex === null) return;
              event.preventDefault();
              const next = kids[nextIndex].camper.id;
              onSelect(next);
              requestAnimationFrame(() => document.getElementById(tabId(next))?.focus());
            }}
          >
            <KidIcon sex={kidIconSex(kid.bedroom?.group, kid.camper.sex)} size={28} />
            {/* phones only have room for the first name; the surname is dropped by CSS */}
            <span>
              {firstName(kid.camper.name)}
              {surname(kid.camper.name) && <span className="parent-kid-tab__rest"> {surname(kid.camper.name)}</span>}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
