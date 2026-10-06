import type { Locale } from "../locales";

export const LITERALS: Record<string, Partial<Record<Exclude<Locale, "pt">, string>>> = {
  "Você entrou como {role}.": {
    en: "You signed in as {role}.",
    es: "Entraste como {role}.",
    fr: "Vous êtes connecté en tant que {role}.",
    de: "Du bist als {role} angemeldet.",
  },
  "🚨 Emergência · {name}": {
    en: "🚨 Emergency · {name}",
    es: "🚨 Emergencia · {name}",
    fr: "🚨 Urgence · {name}",
    de: "🚨 Notfall · {name}",
  },
  "Telefone": {
    en: "Phone",
    es: "Teléfono",
    fr: "Téléphone",
    de: "Telefon",
  },
  "E-mail": {
    en: "Email",
    es: "Correo",
    fr: "E-mail",
    de: "E-Mail",
  },
  "CPF": {
    en: "CPF",
    es: "CPF",
    fr: "CPF",
    de: "CPF",
  },
  "Emergência": {
    en: "Emergency",
    es: "Emergencia",
    fr: "Urgence",
    de: "Notfall",
  },
  "Convênio": {
    en: "Insurance",
    es: "Seguro",
    fr: "Assurance",
    de: "Krankenversicherung",
  },
  "· carteirinha {n}": {
    en: "· card {n}",
    es: "· carnet {n}",
    fr: "· carte {n}",
    de: "· Versichertenkarte {n}",
  },
  "Documentos": {
    en: "Documents",
    es: "Documentos",
    fr: "Documents",
    de: "Dokumente",
  },
  "RG {n}": {
    en: "ID {n}",
    es: "DNI {n}",
    fr: "Pièce {n}",
    de: "Ausweis {n}",
  },
  "CPF {n}": {
    en: "CPF {n}",
    es: "CPF {n}",
    fr: "CPF {n}",
    de: "CPF {n}",
  },
  "Para corrigir o contato de emergência ou os documentos, fale com a organização. O convênio você edita em Início → Informações de saúde.": {
    en: "To fix the emergency contact or documents, talk to the organization. You can edit insurance in Home → Health information.",
    es: "Para corregir el contacto de emergencia o los documentos, habla con la organización. El seguro lo editas en Inicio → Información de salud.",
    fr: "Pour corriger le contact d'urgence ou les documents, parlez à l'organisation. Vous modifiez l'assurance dans Accueil → Informations de santé.",
    de: "Um den Notfallkontakt oder die Dokumente zu korrigieren, wende dich an die Organisation. Die Krankenversicherung kannst du unter Start → Gesundheitsinformationen bearbeiten.",
  },
};
