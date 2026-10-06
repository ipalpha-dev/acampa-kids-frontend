import type { Locale } from "../locales";

export const LITERALS: Record<string, Partial<Record<Exclude<Locale, "pt">, string>>> = {
  "Documento": {
    en: "Document",
    es: "Documento",
    fr: "Document",
    de: "Dokument",
  },
  "Documento não encontrado.": {
    en: "Document not found.",
    es: "Documento no encontrado.",
    fr: "Document introuvable.",
    de: "Dokument nicht gefunden.",
  },
  "sua função": {
    en: "your role",
    es: "tu función",
    fr: "votre fonction",
    de: "deine Funktion",
  },
  "agora": {
    en: "now",
    es: "ahora",
    fr: "maintenant",
    de: "jetzt",
  },
  "Este documento ainda está vazio.": {
    en: "This document is still empty.",
    es: "Este documento aún está vacío.",
    fr: "Ce document est encore vide.",
    de: "Dieses Dokument ist noch leer.",
  },
  "Suas funções": {
    en: "Your roles",
    es: "Tus funciones",
    fr: "Vos fonctions",
    de: "Deine Funktionen",
  },
  "Ver a Preparação": {
    en: "See Prep",
    es: "Ver la Preparación",
    fr: "Voir la Préparation",
    de: "Zur Vorbereitung",
  },
  "A organização ainda não publicou instruções. 📖": {
    en: "The organization hasn't published instructions yet. 📖",
    es: "La organización aún no publicó instrucciones. 📖",
    fr: "L'organisation n'a pas encore publié d'instructions. 📖",
    de: "Die Organisation hat noch keine Hinweise veröffentlicht. 📖",
  },
};
