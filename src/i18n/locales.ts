export const LOCALES = ["pt", "en", "es", "fr", "de"] as const;
export type Locale = (typeof LOCALES)[number];

/** Default / fallback language — Brazilian Portuguese. */
export const DEFAULT_LOCALE: Locale = "pt";

export const LOCALE_TAG: Record<Locale, string> = {
  pt: "pt-BR",
  en: "en-US",
  es: "es-ES",
  fr: "fr-FR",
  de: "de-DE",
};

function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/** "de-AT", "de_CH", "DE" → "de"; anything we do not speak → pt-BR. */
function toLocale(raw: string): Locale {
  const primary = raw.trim().toLowerCase().replace("_", "-").split("-")[0] ?? DEFAULT_LOCALE;
  return isLocale(primary) ? primary : DEFAULT_LOCALE;
}

/** Device language → one of our five. Transparent — no picker. */
export function deviceLocale(): Locale {
  const raw = (typeof navigator !== "undefined" && (navigator.languages?.[0] || navigator.language)) || "pt";
  return toLocale(raw);
}

export function resolveLocale(raw: string | null | undefined): Locale {
  if (!raw) return DEFAULT_LOCALE;
  return toLocale(raw);
}

export function format(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => (vars[key] !== undefined ? String(vars[key]) : `{${key}}`));
}

export function collatorLocale(): string {
  if (typeof document !== "undefined" && document.documentElement.lang) return document.documentElement.lang;
  return LOCALE_TAG[DEFAULT_LOCALE];
}
