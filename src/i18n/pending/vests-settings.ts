import type { Locale } from "../locales";

export const LITERALS: Record<string, Partial<Record<Exclude<Locale, "pt">, string>>> = {
  "Pessoas da equipe que": {
    en: "Staff members who",
    es: "Personas del equipo que",
    fr: "Personnes de l'équipe qui",
    de: "Mitarbeitende, die",
  },
  "entregam e recolhem os coletes": {
    en: "hand out and collect the vests",
    es: "entregan y recogen los chalecos",
    fr: "distribuent et récupèrent les gilets",
    de: "geben die Westen aus und sammeln sie",
  },
  "durante o acampamento. Veem só nome e celular da equipe.": {
    en: "during camp. They only see staff names and mobile numbers.",
    es: "durante el campamento. Solo ven nombre y celular del equipo.",
    fr: "pendant le camp. Elles ne voient que le nom et le portable de l'équipe.",
    de: "während des Camps wieder ein. Sie sehen nur Name und Handynummer der Mitarbeitenden.",
  },
  "Quem cuida dos coletes": {
    en: "Who handles the vests",
    es: "Quién cuida de los chalecos",
    fr: "Qui s'occupe des gilets",
    de: "Wer sich um die Westen kümmert",
  },
  "Adicionar responsável pelos coletes": {
    en: "Add vest helper",
    es: "Añadir responsable de los chalecos",
    fr: "Ajouter un responsable des gilets",
    de: "Westen-Helfer hinzufügen",
  },
  "Ninguém escolhido ainda.": {
    en: "No one chosen yet.",
    es: "Nadie elegido todavía.",
    fr: "Personne choisie pour l'instant.",
    de: "Noch niemand ausgewählt.",
  },
  "Quem cuida dos coletes vê da equipe apenas": {
    en: "Vest helpers see only",
    es: "Quien cuida de los chalecos ve del equipo solo",
    fr: "Ceux qui s'occupent des gilets ne voient de l'équipe que",
    de: "Wer sich um die Westen kümmert, sieht von den Mitarbeitenden nur",
  },
  "nome e celular": {
    en: "name and mobile",
    es: "nombre y celular",
    fr: "nom et portable",
    de: "Name und Handynummer",
  },
  ": nada de quarto, time, saúde ou check-in. Ao entrar na lista a pessoa recebe um SMS avisando (Notificações → Boas-vindas e novas responsabilidades).": {
    en: ": nothing about room, team, health, or check-in. When added to the list the person gets an SMS (Notifications → Welcome and new responsibilities).",
    es: ": nada de habitación, equipo, salud o check-in. Al entrar en la lista la persona recibe un SMS avisando (Notificaciones → Bienvenida y nuevas responsabilidades).",
    fr: " : rien sur la chambre, l'équipe, la santé ou le check-in. En entrant dans la liste, la personne reçoit un SMS (Notifications → Bienvenue et nouvelles responsabilités).",
    de: ": kein Zimmer, kein Team, keine Gesundheitsdaten, kein Check-in. Wer zur Liste hinzukommt, bekommt eine SMS (Benachrichtigungen → Willkommen und neue Aufgaben).",
  },
};
