import { ICONS } from "../icons";
import css from "../pages/admin/staffGroup.module.scss";

const SIZES = [16, 18, 20, 24, 32] as const;

/** The paper-cut "Equipe" icon from the login page, inline-sized (16, 18, 20, 24 or 32 px — the nearest one). */
export default function StaffIcon({ size = 18 }: { size?: number }) {
  const near = SIZES.reduce((best, s) => (Math.abs(s - size) < Math.abs(best - size) ? s : best), SIZES[0]);
  return <img className={`audience-icon ${css.inlineIcon} ${css[`s${near}`]}`} src={ICONS.staff} alt="" aria-hidden="true" width={near} height={near} />;
}
