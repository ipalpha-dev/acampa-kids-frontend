import type { Locale } from "../locales";

export const LITERALS: Record<string, Partial<Record<Exclude<Locale, "pt">, string>>> = {
  "Faltam {n} dias": {
    en: "{n} days to go",
    es: "Faltan {n} días",
    fr: "Plus que {n} jours",
    de: "Noch {n} Tage",
  },
  "É amanhã!": {
    en: "It's tomorrow!",
    es: "¡Es mañana!",
    fr: "C'est demain !",
    de: "Morgen geht's los!",
  },
  "É hoje!": {
    en: "It's today!",
    es: "¡Es hoy!",
    fr: "C'est aujourd'hui !",
    de: "Heute ist es so weit!",
  },
  "Acampamento em andamento": {
    en: "Camp in progress",
    es: "Campamento en curso",
    fr: "Camp en cours",
    de: "Camp läuft",
  },
  "sua função": {
    en: "your role",
    es: "tu función",
    fr: "votre fonction",
    de: "deine Funktion",
  },
  "Desmarcar": {
    en: "Unmark",
    es: "Desmarcar",
    fr: "Décocher",
    de: "Abhaken rückgängig",
  },
  "Marcar como feito": {
    en: "Mark as done",
    es: "Marcar como hecho",
    fr: "Marquer comme fait",
    de: "Als erledigt markieren",
  },
  "Em breve.": {
    en: "Coming soon.",
    es: "Pronto.",
    fr: "Bientôt.",
    de: "Demnächst.",
  },
  "Ver as Instruções": {
    en: "See Instructions",
    es: "Ver las Instrucciones",
    fr: "Voir les Instructions",
    de: "Zu den Hinweisen",
  },
  "Começou": {
    en: "Started",
    es: "Empezó",
    fr: "A commencé",
    de: "Hat begonnen",
  },
  "Começa": {
    en: "Starts",
    es: "Empieza",
    fr: "Commence",
    de: "Beginnt",
  },
  "{n} de {total} itens feitos": {
    en: "{n} of {total} items done",
    es: "{n} de {total} ítems hechos",
    fr: "{n} sur {total} éléments faits",
    de: "{n} von {total} Punkten erledigt",
  },
  "tudo pronto! 🎉": {
    en: "all set! 🎉",
    es: "¡todo listo! 🎉",
    fr: "tout est prêt ! 🎉",
    de: "alles bereit! 🎉",
  },
  "feitos": {
    en: "done",
    es: "hechos",
    fr: "faits",
    de: "erledigt",
  },
  "Olá, {name}! Aqui está tudo o que você precisa saber, levar e vestir antes do acampamento.": {
    en: "Hi, {name}! Here's everything you need to know, bring and wear before camp.",
    es: "¡Hola, {name}! Aquí está todo lo que necesitas saber, llevar y vestir antes del campamento.",
    fr: "Bonjour, {name} ! Voici tout ce que vous devez savoir, apporter et porter avant le camp.",
    de: "Hallo, {name}! Hier ist alles, was du vor dem Camp wissen, mitbringen und anziehen solltest.",
  },
  "Olá, {name}! Aqui está tudo o que sua família precisa saber e preparar antes do acampamento.": {
    en: "Hi, {name}! Here's everything your family needs to know and prepare before camp.",
    es: "¡Hola, {name}! Aquí está todo lo que tu familia necesita saber y preparar antes del campamento.",
    fr: "Bonjour, {name} ! Voici tout ce que votre famille doit savoir et préparer avant le camp.",
    de: "Hallo, {name}! Hier ist alles, was deine Familie vor dem Camp wissen und vorbereiten sollte.",
  },
  " Conforme for resolvendo cada item, marque como feito.": {
    en: " As you finish each item, mark it as done.",
    es: " Conforme vayas resolviendo cada ítem, márcalo como hecho.",
    fr: " Au fur et à mesure, marquez chaque élément comme fait.",
    de: " Hak jeden Punkt ab, sobald du ihn erledigt hast.",
  },
  "Nada para preparar por enquanto. Assim que a organização publicar as orientações, elas aparecem aqui.": {
    en: "Nothing to prepare for now. Once the organizers publish the guidelines, they'll show up here.",
    es: "Nada que preparar por ahora. En cuanto la organización publique las orientaciones, aparecerán aquí.",
    fr: "Rien à préparer pour l'instant. Dès que l'organisation publiera les consignes, elles apparaîtront ici.",
    de: "Gerade gibt es nichts vorzubereiten. Sobald die Organisation die Hinweise veröffentlicht, erscheinen sie hier.",
  },
};
