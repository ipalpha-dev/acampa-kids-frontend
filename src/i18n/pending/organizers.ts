import type { Locale } from "../locales";

export const LITERALS: Record<string, Partial<Record<Exclude<Locale, "pt">, string>>> = {
  "Pessoas da equipe com": {
    en: "Team members with",
    es: "Personas del equipo con",
    fr: "Personnes de l'équipe avec",
    de: "Mitarbeitende mit",
  },
  "acesso de administração": {
    en: "admin access",
    es: "acceso de administración",
    fr: "accès d'administration",
    de: "Admin-Zugriff",
  },
  ": acampantes, equipe, quartos, programação, check-ins, ocorrências e configurações. Veem dados de saúde. Nas ocorrências, só as que os organizadores registraram.": {
    en: ": campers, staff, rooms, programme, check-ins, occurrences and settings. They see health data. In occurrences, only those organizers recorded.",
    es: ": acampantes, equipo, cuartos, programación, check-ins, ocurrencias y ajustes. Ven datos de salud. En las ocurrencias, solo las que registraron los organizadores.",
    fr: " : campeurs, équipe, chambres, programme, check-ins, occurrences et réglages. Ils voient les données de santé. Dans les occurrences, seulement celles enregistrées par les organisateurs.",
    de: ": Kinder, Mitarbeitende, Zimmer, Programm, Check-ins, Vorkommnisse und Einstellungen. Sie sehen Gesundheitsdaten. Bei den Vorkommnissen nur die, die die Organisatoren erfasst haben.",
  },
  "Quem organiza": {
    en: "Who organizes",
    es: "Quién organiza",
    fr: "Qui organise",
    de: "Wer organisiert",
  },
  "Adicionar organizador": {
    en: "Add organizer",
    es: "Añadir organizador",
    fr: "Ajouter un organisateur",
    de: "Organisator hinzufügen",
  },
  "Ninguém escolhido ainda. Só o admin administra o app.": {
    en: "Nobody chosen yet. Only the admin manages the app.",
    es: "Nadie elegido todavía. Solo el admin administra la app.",
    fr: "Personne choisie pour l'instant. Seul l'admin gère l'appli.",
    de: "Noch niemand ausgewählt. Nur der Admin verwaltet die App.",
  },
  "Organizadores dos jogos": {
    en: "Game organizers",
    es: "Organizadores de los juegos",
    fr: "Organisateurs des jeux",
    de: "Spiele-Organisatoren",
  },
  "Editar em Jogos": {
    en: "Edit in Games",
    es: "Editar en Juegos",
    fr: "Modifier dans Jeux",
    de: "In Spiele bearbeiten",
  },
  "Editar em Jogos ›": {
    en: "Edit in Games ›",
    es: "Editar en Juegos ›",
    fr: "Modifier dans Jeux ›",
    de: "In Spiele bearbeiten ›",
  },
  "Editam a programação e lançam pontos no Placar — sem as outras permissões de organizador.": {
    en: "They edit the programme and post scores on the Scoreboard — without the other organizer permissions.",
    es: "Editan la programación y cargan puntos en el Marcador — sin los demás permisos de organizador.",
    fr: "Ils modifient le programme et saisissent des points au Tableau des scores — sans les autres permissions d'organisateur.",
    de: "Sie bearbeiten das Programm und tragen Punkte im Punktestand ein — ohne die übrigen Organisator-Rechte.",
  },
  "Ninguém ainda.": {
    en: "Nobody yet.",
    es: "Nadie todavía.",
    fr: "Personne pour l'instant.",
    de: "Noch niemand.",
  },
  "🔒 Organizadores não mexem nesta lista nem em Categorias, Notificações e Sobre — só o admin.": {
    en: "🔒 Organizers don't change this list or Categories, Notifications and About — only the admin.",
    es: "🔒 Los organizadores no tocan esta lista ni Categorías, Notificaciones y Acerca de — solo el admin.",
    fr: "🔒 Les organisateurs ne touchent pas à cette liste ni à Catégories, Notifications et À propos — seul l'admin.",
    de: "🔒 Organisatoren ändern weder diese Liste noch Kategorien, Benachrichtigungen und Über — nur der Admin.",
  },
};
