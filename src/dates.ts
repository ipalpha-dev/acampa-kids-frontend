import { LOCALE_TAG, resolveLocale, type Locale } from "./i18n/locales";

export type DayStyle = "long" | "short" | "weekday" | "month" | "compact";

function loc(): Locale {
  if (typeof document === "undefined") return "pt";
  return resolveLocale(document.documentElement.lang);
}

function tag(): string {
  return LOCALE_TAG[loc()];
}

const REL: Record<Locale, { today: string; tomorrow: string; yesterday: string; at: string }> = {
  pt: { today: "hoje", tomorrow: "amanhã", yesterday: "ontem", at: "às" },
  en: { today: "today", tomorrow: "tomorrow", yesterday: "yesterday", at: "at" },
  es: { today: "hoy", tomorrow: "mañana", yesterday: "ayer", at: "a las" },
  fr: { today: "aujourd'hui", tomorrow: "demain", yesterday: "hier", at: "à" },
  de: { today: "heute", tomorrow: "morgen", yesterday: "gestern", at: "um" },
};

/** Local "YYYY-MM-DD" on the device clock. */
export function todayIso(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** "YYYY-MM-DD" of an ISO instant on the device clock. */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function stripDot(s: string): string {
  return s.replace(/\.$/, "");
}

/** Calendar-day distance: 0 = hoje, 1 = amanhã, -1 = ontem. */
export function daysFromToday(isoDay: string, now = new Date()): number {
  const a = parseDay(todayIso(now));
  const b = parseDay(isoDay);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function relativeWord(diff: number): string | null {
  const r = REL[loc()];
  if (diff === 0) return r.today;
  if (diff === 1) return r.tomorrow;
  if (diff === -1) return r.yesterday;
  return null;
}

/**
 * Programme / calendar day.
 * - long → "Sábado, 12 de setembro"
 * - short → "sáb 12"
 * - weekday → "sáb"
 * - month → "12 de set"
 * - compact → "12/09"
 */
export function speakDay(iso: string, style: DayStyle = "long"): string {
  const date = parseDay(iso);
  if (style === "compact") {
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}`;
  }
  if (style === "weekday") {
    return stripDot(new Intl.DateTimeFormat(tag(), { weekday: "short" }).format(date));
  }
  if (style === "short") {
    const wd = stripDot(new Intl.DateTimeFormat(tag(), { weekday: "short" }).format(date));
    return `${wd} ${date.getDate()}`;
  }
  if (style === "month") {
    return stripDot(new Intl.DateTimeFormat(tag(), { day: "numeric", month: "short" }).format(date));
  }
  const s = new Intl.DateTimeFormat(tag(), { weekday: "long", day: "numeric", month: "long" }).format(date);
  return cap(s);
}

/** "sáb 12/09" — birthday banner, SMS-ish lists. */
export function speakDaySlash(iso: string): string {
  const date = parseDay(iso);
  const wd = stripDot(new Intl.DateTimeFormat(tag(), { weekday: "short" }).format(date));
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${wd} ${dd}/${mm}`;
}

/** Birth date "YYYY-MM-DD" → "12/09/2018"; null stays null. */
export function speakBirth(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

/** Instant → "07:42". */
export function speakTime(iso: string): string {
  return new Intl.DateTimeFormat(tag(), { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/**
 * Compact stamp for lists: "hoje 07:42", "ontem 19:10", "12/09 07:42".
 * Year only when it isn't the current one: "12/09/25 07:42".
 */
export function speakStamp(iso: string, now = new Date()): string {
  const t = speakTime(iso);
  const key = dayKey(iso);
  const rel = relativeWord(daysFromToday(key, now));
  if (rel) return `${rel} ${t}`;
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const sameYear = d.getFullYear() === now.getFullYear();
  const day = sameYear ? `${dd}/${mm}` : `${dd}/${mm}/${String(d.getFullYear()).slice(2)}`;
  return `${day} ${t}`;
}

/**
 * Spoken moment for windows & messages: "hoje às 07:42", "amanhã às 08:00",
 * "sáb 12/09 às 14:30". Pass `long: true` for "sábado, 12 de setembro às 14:30".
 */
export function speakWhen(iso: string, opts: { long?: boolean; now?: Date } = {}): string {
  const now = opts.now ?? new Date();
  const t = speakTime(iso);
  const key = dayKey(iso);
  const rel = relativeWord(daysFromToday(key, now));
  const at = REL[loc()].at;
  if (rel) return `${rel} ${at} ${t}`;
  if (opts.long) {
    const day = new Intl.DateTimeFormat(tag(), {
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(new Date(iso));
    return `${day} ${at} ${t}`;
  }
  const d = new Date(iso);
  const wd = stripDot(new Intl.DateTimeFormat(tag(), { weekday: "short" }).format(d));
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${wd} ${dd}/${mm} ${at} ${t}`;
}

/** Admin / export absolute: "12/09/2026, 07:42". */
export function speakDateTime(iso: string): string {
  return new Intl.DateTimeFormat(tag(), { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}

export function speakAgo(iso: string | null, now = Date.now()): string {
  const language = loc();
  if (!iso) {
    return language === "en" ? "never synced" : language === "fr" ? "jamais synchronisé" : language === "de" ? "noch nie synchronisiert" : "nunca sincronizado";
  }
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 10) {
    return language === "en" ? "just now" : language === "es" ? "ahora mismo" : language === "fr" ? "à l'instant" : language === "de" ? "gerade eben" : "agora mesmo";
  }
  if (s < 60) {
    return language === "en" ? `${s}s ago` : language === "fr" ? `il y a ${s}s` : language === "es" ? `hace ${s}s` : language === "de" ? `vor ${s} s` : `há ${s}s`;
  }
  const m = Math.round(s / 60);
  if (m < 60) {
    return language === "en" ? `${m} min ago` : language === "fr" ? `il y a ${m} min` : language === "es" ? `hace ${m} min` : language === "de" ? `vor ${m} Min.` : `há ${m} min`;
  }
  const h = Math.round(m / 60);
  if (h < 48) {
    return language === "en" ? `${h}h ago` : language === "fr" ? `il y a ${h}h` : language === "es" ? `hace ${h}h` : language === "de" ? `vor ${h} Std.` : `há ${h}h`;
  }
  return speakStamp(iso, new Date(now));
}
