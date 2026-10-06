import { useEffect } from "react";
import Breadcrumbs from "../../components/Breadcrumbs";
import KidIcon from "../../components/KidIcon";
import { kidSexOf } from "../../icons";
import { GROUP_META, type Bedroom } from "../../api/bedrooms";
import CamperCard from "../../components/CamperCard";
import GroupIcon from "../../components/GroupIcon";
import StaffIcon from "../../components/StaffIcon";
import StaffMiniCard from "../../components/StaffMiniCard";
import { useBedroomDetail, useLabelOf } from "../../store/derive";
import { useI18n } from "../../i18n";
import type { DetailNav } from "./DetailStack";

interface BedroomDetailProps {
  token: string;
  bedroomId: string;
  nav: DetailNav;
  /** absent = read-only (medical team, or opened from another page): no pencil */
  onEdit?: (bedroom: Bedroom) => void;
  onOpenStaff: (staffId: string) => void;
  onOpenCamper?: (camperId: string) => void;
  onOpenBedroom?: (bedroomId: string) => void;
}

/** One room: layout + occupancy, the staff caretakers and the kids sleeping there. */
export default function BedroomDetail({ bedroomId, nav, onEdit, onOpenStaff, onOpenCamper }: BedroomDetailProps) {
  const { tx } = useI18n();
  // joined locally from the store — works offline and updates live
  const data = useBedroomDetail(bedroomId);
  const error = data === undefined ? tx("Quarto não encontrado.") : null;
  const labelOf = useLabelOf();
  const { setTitle } = nav;
  useEffect(() => {
    if (data) setTitle(tx("Quarto {name}", { name: data.bedroom.name }));
  }, [data, setTitle, tx]);

  if (!data) {
    return (
      <div className="admin-page">
        <Breadcrumbs items={nav.crumbs} />
        {error ? <p className="message message--error">{error}</p> : <p className="opt-empty">{tx("Sincronizando… 🏕️")}</p>}
      </div>
    );
  }

  const { bedroom: b, campers, staff } = data;
  const m = GROUP_META[b.group];
  const pct = b.capacity ? Math.round((b.occupied / b.capacity) * 100) : 0;

  return (
    <div className="admin-page">
      <Breadcrumbs items={nav.crumbs} />
      <header className="admin-head">
        <h1 className={`admin-title detail-title room-group__title--${m.color}`}>
          <GroupIcon group={b.group} /> {tx("Quarto {name}", { name: b.name })}
        </h1>
        {onEdit && (
          <button type="button" className="icon-btn icon-btn--lg" title={tx("Editar quarto")} aria-label={tx("Editar quarto")} onClick={() => onEdit(b)}>
            <span className="pencil" aria-hidden="true">✏️</span>
          </button>
        )}
      </header>

      <section className="detail-card">
        <dl className="detail-grid">
          <dt>{tx("Ala")}</dt>
          <dd>{tx(m.label)}</dd>
          <dt>{tx("Camas")}</dt>
          <dd>
            {b.bunkBeds > 0 && tx(b.bunkBeds === 1 ? "{n} beliche" : "{n} beliches", { n: b.bunkBeds })}
            {b.bunkBeds > 0 && b.singleBeds > 0 && " + "}
            {b.singleBeds > 0 && tx("{n} solteiro", { n: b.singleBeds })}
            {" "}· {tx("{n} lugares", { n: b.capacity })}
          </dd>
          <dt>{tx("Ocupação")}</dt>
          <dd>
            <span className="room-card__occ">
              <span className="room-card__bar" aria-hidden="true">
                <span className="room-card__bar-fill" style={{ width: `${pct}%` }} />
              </span>
              <span className="room-card__count">
                {b.occupied}/{b.capacity}
              </span>
            </span>
            <span className="cat-hint">
              {tx(b.occupiedCampers === 1 ? "{n} criança" : "{n} crianças", { n: b.occupiedCampers })} · {b.occupiedStaff} {tx("da equipe")} · {tx(b.available === 1 ? "{n} livre" : "{n} livres", { n: b.available })}
            </span>
          </dd>
          {b.notes && (
            <>
              <dt>{tx("Observações")}</dt>
              <dd>{b.notes}</dd>
            </>
          )}
        </dl>
      </section>

      <section className="detail-section">
        <h2 className="detail-h2">
          <StaffIcon size={24} /> {tx("Responsáveis no quarto")} <span className="cat-tab__count">{staff.length}</span>
        </h2>
        {staff.length === 0 ? (
          <p className="opt-empty">{b.group === "staff" ? tx("Ninguém alocado.") : tx("⚠️ Nenhum líder da equipe neste quarto.")}</p>
        ) : (
          <ul className="staff-list">
            {staff.map((s) => (
              <StaffMiniCard key={s.id} staff={s} labelOf={labelOf} onOpen={onOpenStaff} />
            ))}
          </ul>
        )}
      </section>

      {b.group !== "staff" && (
        <section className="detail-section">
          <h2 className="detail-h2">
            <KidIcon sex={kidSexOf(b.group)} group size={26} /> {tx("Crianças")} <span className="cat-tab__count">{campers.length}</span>
          </h2>
          {campers.length === 0 ? (
            <p className="opt-empty">{tx("Nenhuma criança neste quarto.")}</p>
          ) : (
            <ul className="kid-list">
              {campers.map((k) => (
                <CamperCard key={k.id} camper={k} labelOf={labelOf} hideBedroom onOpen={onOpenCamper} />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
