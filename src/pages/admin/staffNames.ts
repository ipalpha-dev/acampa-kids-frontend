import { collatorLocale } from "../../i18n";

/**
 * Names come live from IPAlpha and are "" until they arrive (offline, or the
 * background page has not reached this person yet): never render a blank row.
 */
export const NAME_PENDING = "…";

/** the full name, or a gentle "…" while it is not known yet */
export function shownName(name: string | null | undefined): string {
  return name?.trim() || NAME_PENDING;
}

/** the first name, or "…" while it is not known yet */
export function firstNameOf(name: string | null | undefined): string {
  return shownName(name).split(/\s+/)[0];
}

/** alphabetical; people whose name has not arrived yet go last (stable among themselves) */
export function compareByName(a: { name: string }, b: { name: string }): number {
  const ea = !a.name, eb = !b.name;
  if (ea !== eb) return ea ? 1 : -1;
  return a.name.localeCompare(b.name, collatorLocale(), { sensitivity: "base" });
}
