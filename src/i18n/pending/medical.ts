import type { Locale } from "../locales";

export const LITERALS: Record<string, Partial<Record<Exclude<Locale, "pt">, string>>> = {
  "Pessoas da equipe que cuidam da": {
    en: "Staff who care for the",
    es: "Personas del equipo que cuidan de la",
    fr: "Personnes de l'équipe qui s'occupent de la",
    de: "Mitarbeitende, zuständig für die",
  },
  "saúde das crianças": {
    en: "children's health",
    es: "salud de los niños",
    fr: "santé des enfants",
    de: "Gesundheit der Kinder",
  },
  ". Veem a ficha completa de": {
    en: ". They see the full record of",
    es: ". Ven la ficha completa de",
    fr: ". Ils voient la fiche complète de",
    de: ". Sie sehen das vollständige Datenblatt",
  },
  "todos os acampantes": {
    en: "every camper",
    es: "todos los campistas",
    fr: "tous les campeurs",
    de: "aller Kinder",
  },
  "(alergias, remédios, condições, contatos) e baixam a planilha de saúde. Nas ocorrências, só as que a equipe médica registrou.": {
    en: "(allergies, medicines, conditions, contacts) and download the health spreadsheet. In incidents, only those the medical team recorded.",
    es: "(alergias, medicinas, condiciones, contactos) y descargan la planilla de salud. En las ocurrencias, solo las que registró el equipo médico.",
    fr: "(allergies, médicaments, conditions, contacts) et téléchargent la feuille de santé. Dans les incidents, seulement ceux enregistrés par l'équipe médicale.",
    de: "(Allergien, Medikamente, Erkrankungen, Kontakte) und laden die Gesundheitstabelle herunter. Bei den Vorkommnissen nur die, die das Gesundheitsteam erfasst hat.",
  },
  "Quem é da equipe médica": {
    en: "Who is on the medical team",
    es: "Quién forma el equipo médico",
    fr: "Qui fait partie de l'équipe médicale",
    de: "Wer zum Gesundheitsteam gehört",
  },
  "Adicionar à equipe médica": {
    en: "Add to the medical team",
    es: "Añadir al equipo médico",
    fr: "Ajouter à l'équipe médicale",
    de: "Zum Gesundheitsteam hinzufügen",
  },
  "Ninguém escolhido ainda.": {
    en: "Nobody chosen yet.",
    es: "Nadie elegido todavía.",
    fr: "Personne choisie pour l'instant.",
    de: "Noch niemand ausgewählt.",
  },
  "🔒 A equipe médica só consulta: não cadastra, edita nem exclui crianças ou quartos, não faz check-in e não baixa a lista em Excel.": {
    en: "🔒 The medical team is read-only: they don't register, edit or delete children or rooms, don't check people in, and don't download the Excel list.",
    es: "🔒 El equipo médico solo consulta: no registra, edita ni elimina niños o habitaciones, no hace check-in y no descarga la lista en Excel.",
    fr: "🔒 L'équipe médicale consulte seulement : elle n'enregistre, ne modifie ni ne supprime d'enfants ou de chambres, ne fait pas de check-in et ne télécharge pas la liste Excel.",
    de: "🔒 Das Gesundheitsteam hat nur Lesezugriff: Es legt keine Kinder oder Zimmer an, bearbeitet oder löscht sie nicht, macht keinen Check-in und lädt die Excel-Liste nicht herunter.",
  },
};
