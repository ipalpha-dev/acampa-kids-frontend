import { ICONS } from "../../icons";
import { useI18n } from "../../i18n";
import { useRoute } from "../../router";

const OPTIONS = [
  {
    key: "church",
    path: "/checkin/church",
    emoji: "⛪",
    title: "Igreja",
  },
  {
    key: "bus",
    path: "/checkin/bus",
    icon: ICONS.transport,
    title: "Ônibus",
  },
  {
    key: "staff",
    path: "/checkin/staff",
    icon: ICONS.staff,
    title: "Equipe",
  },
  {
    key: "vests",
    path: "/checkin/vests",
    emoji: "🦺",
    title: "Coletes",
  },
] as const;

/** Admin landing page for the check-in workflows (kids at the church / bus, team, team vests). */
export default function AdminCheckinPage() {
  const { navigate } = useRoute();
  const { tx } = useI18n();

  return (
    <div className="admin-page">
      <header className="admin-head">
        <h1 className="admin-title">✅ {tx("Check-in")}</h1>
      </header>
      <p className="admin-intro">{tx("Qual check-in você quer abrir?")}</p>

      <ul className="checkin-picker">
        {OPTIONS.map((option) => (
          <li key={option.key}>
            <button type="button" className="checkin-picker__item" onClick={() => navigate(option.path)}>
              {"icon" in option ? (
                <img className="checkin-picker__icon" src={option.icon} alt="" aria-hidden="true" />
              ) : (
                <span className="checkin-picker__emoji" aria-hidden="true">{option.emoji}</span>
              )}
              <span className="checkin-picker__name">{option.key === "vests" ? tx("Coletes") : tx("Check-in {title}", { title: tx(option.title) })}</span>
              <span className="checkin-picker__arrow" aria-hidden="true">›</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
