import type { Locale } from "../locales";

export const LITERALS: Record<string, Partial<Record<Exclude<Locale, "pt">, string>>> = {
  "Algo deu errado.": {
    en: "Something went wrong.",
    es: "Algo salió mal.",
    fr: "Une erreur s'est produite.",
    de: "Da ist etwas schiefgelaufen.",
  },
  "Carregando configurações… ⚙️": {
    en: "Loading settings… ⚙️",
    es: "Cargando ajustes… ⚙️",
    fr: "Chargement des réglages… ⚙️",
    de: "Einstellungen werden geladen… ⚙️",
  },
  "Pessoas da equipe que": {
    en: "Staff who",
    es: "Personas del equipo que",
    fr: "Les membres de l'équipe qui",
    de: "Mitarbeitende, die",
  },
  "enviam as fotos": {
    en: "upload the photos",
    es: "envían las fotos",
    fr: "envoient les photos",
    de: "laden die Fotos",
  },
  "do acampamento na aba": {
    en: "of the camp in the",
    es: "del campamento en la pestaña",
    fr: "du camp dans l'onglet",
    de: "vom Camp hoch, im Tab",
  },
  ". As fotos só aparecem para": {
    en: ". Photos only appear for",
    es: ". Las fotos solo aparecen para",
    fr: ". Les photos n'apparaissent pour",
    de: ". Die Fotos sehen",
  },
  "pais e equipe": {
    en: "parents and staff",
    es: "padres y equipo",
    fr: "les parents et l'équipe",
    de: "Eltern und Mitarbeitende",
  },
  "quando o álbum é publicado.": {
    en: "when the album is published.",
    es: "cuando el álbum se publica.",
    fr: "que lorsque l'album est publié.",
    de: "erst, wenn das Album veröffentlicht ist.",
  },
  "Álbum publicado": {
    en: "Album published",
    es: "Álbum publicado",
    fr: "Album publié",
    de: "Album veröffentlicht",
  },
  "Publicado": {
    en: "Published",
    es: "Publicado",
    fr: "Publié",
    de: "Veröffentlicht",
  },
  "Só os fotógrafos": {
    en: "Photographers only",
    es: "Solo los fotógrafos",
    fr: "Photographes seulement",
    de: "Nur die Fotografen",
  },
  "Vale para": {
    en: "Applies to",
    es: "Vale para",
    fr: "S'applique à",
    de: "Gilt für",
  },
  "todas as fotos de uma vez": {
    en: "all photos at once",
    es: "todas las fotos de una vez",
    fr: "toutes les photos d'un coup",
    de: "alle Fotos auf einmal",
  },
  ": ao ligar, pais e equipe veem o álbum na hora e recebem um aviso. Ao desligar, as fotos voltam a ficar só com os fotógrafos.": {
    en: ": when on, parents and staff see the album right away and get a notice. When off, photos go back to photographers only.",
    es: ": al activarlo, padres y equipo ven el álbum al momento y reciben un aviso. Al desactivarlo, las fotos vuelven a quedar solo con los fotógrafos.",
    fr: " : une fois activé, parents et équipe voient l'album tout de suite et reçoivent un avis. Une fois désactivé, les photos restent à nouveau uniquement pour les photographes.",
    de: ": Schaltest du es ein, sehen Eltern und Mitarbeitende das Album sofort und bekommen eine Benachrichtigung. Schaltest du es aus, sind die Fotos wieder nur für die Fotografen sichtbar.",
  },
  "✅ {n} foto visível para o acampamento.": {
    en: "✅ {n} photo visible to the camp.",
    es: "✅ {n} foto visible para el campamento.",
    fr: "✅ {n} photo visible pour le camp.",
    de: "✅ {n} Foto ist für das Camp sichtbar.",
  },
  "✅ {n} fotos visíveis para o acampamento.": {
    en: "✅ {n} photos visible to the camp.",
    es: "✅ {n} fotos visibles para el campamento.",
    fr: "✅ {n} photos visibles pour le camp.",
    de: "✅ {n} Fotos sind für das Camp sichtbar.",
  },
  "🔒 {n} foto guardada — ninguém fora da lista vê.": {
    en: "🔒 {n} photo kept private — no one outside the list sees it.",
    es: "🔒 {n} foto guardada — nadie fuera de la lista la ve.",
    fr: "🔒 {n} photo gardée — personne hors de la liste ne la voit.",
    de: "🔒 {n} Foto privat — niemand außerhalb der Liste sieht es.",
  },
  "🔒 {n} fotos guardadas — ninguém fora da lista vê.": {
    en: "🔒 {n} photos kept private — no one outside the list sees them.",
    es: "🔒 {n} fotos guardadas — nadie fuera de la lista las ve.",
    fr: "🔒 {n} photos gardées — personne hors de la liste ne les voit.",
    de: "🔒 {n} Fotos privat — niemand außerhalb der Liste sieht sie.",
  },
  "Ninguém escolhido ainda.": {
    en: "No one chosen yet.",
    es: "Nadie elegido todavía.",
    fr: "Personne choisie pour l'instant.",
    de: "Noch niemand ausgewählt.",
  },
  "Ao entrar na lista a pessoa recebe um SMS avisando — e ganha a aba Fotos com o botão de enviar. O mesmo botão de publicar está lá.": {
    en: "When added to the list, the person gets an SMS notice — and gains the Photos tab with the upload button. The same publish button is there.",
    es: "Al entrar en la lista la persona recibe un SMS avisando — y gana la pestaña Fotos con el botón de enviar. El mismo botón de publicar está ahí.",
    fr: "En entrant dans la liste, la personne reçoit un SMS d'avis — et obtient l'onglet Photos avec le bouton d'envoi. Le même bouton de publication s'y trouve.",
    de: "Wer auf die Liste kommt, bekommt eine SMS — und den Tab Fotos mit dem Hochladen-Button. Dort ist auch derselbe Veröffentlichen-Button.",
  },
};
