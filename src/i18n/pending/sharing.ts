import type { Locale } from "../locales";

/** The family confirms what is shared about THEMSELVES with the camp (decision 87, parent area). */
export const LITERALS: Record<string, Partial<Record<Exclude<Locale, "pt">, string>>> = {
  "Confirme o que você compartilha com o acampamento": {
    en: "Confirm what you share with the camp",
    es: "Confirma lo que compartes con el campamento",
    fr: "Confirmez ce que vous partagez avec le camp",
    de: "Bestätige, was du mit dem Camp teilst",
  },
  "Para a equipe cuidar bem da sua criança e conseguir falar com você quando precisar, o acampamento gostaria de ver:": {
    en: "So the team can take good care of your child and reach you whenever needed, the camp would like to see:",
    es: "Para que el equipo cuide bien de tu niño o niña y pueda hablar contigo cuando haga falta, el campamento quisiera ver:",
    fr: "Pour que l'équipe prenne bien soin de votre enfant et puisse vous joindre au besoin, le camp aimerait voir :",
    de: "Damit das Team gut für dein Kind sorgen und dich bei Bedarf erreichen kann, möchte das Camp Folgendes sehen:",
  },
  "Fica guardado no IPAlpha, com todo o cuidado. Nada é compartilhado antes de você confirmar.": {
    en: "It stays in IPAlpha, kept with care. Nothing is shared before you confirm.",
    es: "Queda guardado en IPAlpha, con todo cuidado. No se comparte nada antes de que confirmes.",
    fr: "Tout reste dans IPAlpha, conservé avec soin. Rien n'est partagé avant votre confirmation.",
    de: "Es bleibt sorgfältig in IPAlpha aufbewahrt. Vor deiner Bestätigung wird nichts geteilt.",
  },
  "Confirmar e compartilhar": { en: "Confirm and share", es: "Confirmar y compartir", fr: "Confirmer et partager", de: "Bestätigen und teilen" },
  "Obrigado! Agora a equipe pode cuidar bem da sua criança e falar com você quando precisar.": {
    en: "Thank you! The team can now take good care of your child and reach you whenever needed.",
    es: "¡Gracias! Ahora el equipo puede cuidar bien de tu niño o niña y hablar contigo cuando haga falta.",
    fr: "Merci ! L'équipe peut maintenant bien prendre soin de votre enfant et vous joindre au besoin.",
    de: "Danke! Das Team kann jetzt gut für dein Kind sorgen und dich bei Bedarf erreichen.",
  },
  "O que pedimos mudou um pouquinho. Confira a lista de novo, por favor.": {
    en: "What we're asking changed a little. Please take another look at the list.",
    es: "Lo que pedimos cambió un poquito. Revisa la lista de nuevo, por favor.",
    fr: "Ce que nous demandons a un peu changé. Merci de revoir la liste.",
    de: "Unsere Bitte hat sich ein wenig geändert. Schau dir die Liste bitte noch einmal an.",
  },
  "Não foi possível confirmar agora. Tente de novo.": {
    en: "We couldn't confirm right now. Please try again.",
    es: "No se pudo confirmar ahora. Inténtalo de nuevo.",
    fr: "Impossible de confirmer pour le moment. Réessayez.",
    de: "Die Bestätigung hat gerade nicht geklappt. Versuch es noch einmal.",
  },

  // ── what is shared, about the family member themselves ("Seu e-mail", "Agora não", "Confirmando…" live in other groups) ──
  "Seu celular": { en: "Your mobile number", es: "Tu celular", fr: "Votre numéro de portable", de: "Deine Handynummer" },
  "Seu documento": { en: "Your ID document", es: "Tu documento", fr: "Votre pièce d'identité", de: "Dein Ausweisdokument" },
  "Seu endereço": { en: "Your address", es: "Tu dirección", fr: "Votre adresse", de: "Deine Adresse" },
  "Suas informações de saúde": { en: "Your health information", es: "Tu información de salud", fr: "Vos informations de santé", de: "Deine Gesundheitsangaben" },
  "Sua escola": { en: "Your school", es: "Tu escuela", fr: "Votre école", de: "Deine Schule" },
  "Um contato para emergências": { en: "A contact for emergencies", es: "Un contacto para emergencias", fr: "Un contact en cas d'urgence", de: "Ein Kontakt für Notfälle" },
};
