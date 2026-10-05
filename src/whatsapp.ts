import { loadAuth } from "./auth/store";

/**
 * How the greetings name the camp: the label of the session's current camp
 * ("Acampa Kids 2026"), or "Acampa Kids <its year>" when it has no label —
 * never a year written in the code.
 */
export function currentCampLabel(camp: { label?: string | null; year?: number | null } | null | undefined = loadAuth()?.camp): string {
  const label = camp?.label?.trim();
  if (label) return label;
  return camp?.year ? `Acampa Kids ${camp.year}` : "Acampa Kids";
}

/** First name of a person, or `fallback` when the name is blank. */
function firstName(name: string, fallback: string): string {
  const first = name.trim().split(/\s+/)[0];
  return first || fallback;
}

/**
 * The opening message a caretaker sends to a kid's guardian, e.g.
 * "Olá, Marcela! Meu nome é Cesar e sou o responsável pela Ana aqui no
 *  Acampa Kids 2026. Como você está?" (the camp label of the session)
 */
export function guardianGreeting(opts: { guardianName: string; staffName: string; camperName: string; campLabel?: string }): string {
  const guardian = firstName(opts.guardianName, "");
  const staff = firstName(opts.staffName, "da equipe");
  const camper = firstName(opts.camperName, "seu filho(a)");
  const hello = guardian ? `Olá, ${guardian}!` : "Olá!";
  return `${hello} Meu nome é ${staff} e sou responsável por ${camper} aqui no ${opts.campLabel ?? currentCampLabel()}. Como você está?`;
}

/**
 * Generic opening message from a logged-in person to anyone in the camp, e.g.
 * "Olá, Cesar! Aqui é Flavi, do Acampa Kids 2026." (the camp label of the session)
 * With `about` (a kid's name): "… Estou entrando em contato sobre a Ana."
 */
export function staffGreeting(opts: { toName: string; fromName: string; about?: string; campLabel?: string }): string {
  const to = firstName(opts.toName, "");
  const from = firstName(opts.fromName, "");
  const hello = to ? `Olá, ${to}!` : "Olá!";
  const camp = opts.campLabel ?? currentCampLabel();
  const who = from ? `Aqui é ${from}, do ${camp}.` : `Aqui é do ${camp}.`;
  const about = opts.about ? ` Estou entrando em contato sobre ${firstName(opts.about, "seu filho(a)")}.` : "";
  return `${hello} ${who}${about}`;
}

/** wa.me deep link (works on phones with the app and on desktop via WhatsApp Web). */
export function whatsappLink(phoneE164: string, text: string): string {
  const digits = phoneE164.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
