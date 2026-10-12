import type { Locale } from "../locales";

export const LITERALS: Record<string, Partial<Record<Exclude<Locale, "pt">, string>>> = {
  "🏕️ Acampamento Kids": { en: "🏕️ Kids Camp", es: "🏕️ Campamento Kids", fr: "🏕️ Camp Kids", de: "🏕️ Kids-Camp" },
  "Versão": { en: "Version", es: "Versión", fr: "Version", de: "Version" },
  "Backup": { en: "Backup", es: "Copia de seguridad", fr: "Sauvegarde", de: "Backup" },
  "Tokens": { en: "Tokens", es: "Tokens", fr: "Jetons", de: "Tokens" },
  "SMS enviados": { en: "SMS sent", es: "SMS enviados", fr: "SMS envoyés", de: "Gesendete SMS" },
  "Custo de SMS": { en: "SMS cost", es: "Costo de SMS", fr: "Coût des SMS", de: "SMS-Kosten" },
  "tokens": { en: "tokens", es: "tokens", fr: "jetons", de: "Tokens" },
  "entrada": { en: "input", es: "entrada", fr: "entrée", de: "Eingabe" },
  "saída": { en: "output", es: "salida", fr: "sortie", de: "Ausgabe" },
  "Não foi possível carregar o uso de SMS.": {
    en: "Could not load the SMS usage.",
    es: "No se pudo cargar el uso de SMS.",
    fr: "Impossible de charger l'utilisation des SMS.",
    de: "Die SMS-Nutzung konnte nicht geladen werden.",
  },
  "Uso de IA": { en: "AI usage", es: "Uso de IA", fr: "Utilisation de l'IA", de: "KI-Nutzung" },
  "A IA do Acampa passa pelo IPAlpha. O uso e o custo aparecem no Oikos, junto com o limite mensal do aplicativo.": {
    en: "Acampa's AI goes through IPAlpha. Its usage and cost appear in Oikos, together with the app's monthly limit.",
    es: "La IA de Acampa pasa por IPAlpha. El uso y el costo aparecen en Oikos, junto con el límite mensual de la aplicación.",
    fr: "L'IA d'Acampa passe par IPAlpha. L'utilisation et le coût apparaissent dans Oikos, avec la limite mensuelle de l'application.",
    de: "Die KI von Acampa läuft über IPAlpha. Nutzung und Kosten erscheinen in Oikos, zusammen mit dem monatlichen Limit der App.",
  },
};
