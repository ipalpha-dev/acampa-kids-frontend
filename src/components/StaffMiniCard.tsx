import { ROOM_ROLE_META, staffSex, type Staff } from "../api/staff";
import { useCollectionOrEmpty } from "../store";
import { loadAuth } from "../auth/store";
import { useI18n } from "../i18n";
import { shownName } from "../pages/admin/staffNames";
import css from "../pages/admin/staffGroup.module.scss";
import HealthHeart from "./HealthHeart";
import PersonContact from "./PersonContact";
import RoomRoleIcon from "./RoomRoleIcon";
import TeamTag from "./TeamTag";
import TransportTag from "./TransportTag";

interface StaffMiniCardProps {
  staff: Staff;
  /** kept for call-site compatibility; the team is resolved from the store */
  labelOf?: (id: string | null | undefined) => string | null;
  /** click → open the person */
  onOpen?: (staffId: string) => void;
}

/**
 * Compact staff row (name, room role, team, contact). The body is the link.
 * The phone is never in the record: "Ver contato" reads it from IPAlpha on tap.
 */
export default function StaffMiniCard({ staff: s, onOpen }: StaffMiniCardProps) {
  const { tx } = useI18n();
  const open = onOpen ? () => onOpen(s.id) : undefined;
  const token = loadAuth()?.token ?? "";
  const bedrooms = useCollectionOrEmpty("bedrooms");
  return (
    <li className={`staff-card staff-card--compact staff-card--cover ${open ? "staff-card--clickable" : ""} ${s.active ? "" : "staff-card--inactive"}`}>
      <div
        className="staff-card__body"
        role={open ? "link" : undefined}
        tabIndex={open ? 0 : undefined}
        title={open ? tx("Ver {name}", { name: shownName(s.name) }) : undefined}
        onClick={open}
        onKeyDown={
          open
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  open();
                }
              }
            : undefined
        }
      >
        <h3 className="staff-card__name staff-card__name--with-tags">
          <span className="staff-card__name-text">
            <span className={s.name ? undefined : css.pendingName}>{shownName(s.name)}</span>
            <HealthHeart show={s.hasHealth} />
            {!s.active && <span className="staff-card__inactive">{tx("inativo")}</span>}
          </span>
          {(s.bedroom || s.team || s.transportation) && (
            <span className="staff-card__tags">
              {s.bedroom && (
                <span className="staff-tag staff-tag--soft" title={tx(ROOM_ROLE_META[s.roomRole].hint)}>
                  <RoomRoleIcon role={s.roomRole} sex={staffSex(s, bedrooms)} /> {tx(ROOM_ROLE_META[s.roomRole].label)}
                </span>
              )}
              <TeamTag teamId={s.team} />
              <TransportTag transportId={s.transportation} size={18} short className="staff-tag--pill" />
            </span>
          )}
        </h3>
      </div>
      {token && (
        <span className={css.cardContact}>
          <PersonContact token={token} personId={s.id} name={s.name} compact />
        </span>
      )}
    </li>
  );
}
