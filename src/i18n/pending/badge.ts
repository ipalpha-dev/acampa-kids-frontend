import type { Locale } from "../locales";

export const LITERALS: Record<string, Partial<Record<Exclude<Locale, "pt">, string>>> = {
  ". Use só em emergência": {
    en: ". Use only in an emergency",
    es: ". Úsalo solo en emergencia",
    fr: ". À utiliser uniquement en urgence",
    de: ". Nur im Notfall verwenden",
  },
  ". Use só em emergência (leitura fora do escopo nº {n})": {
    en: ". Use only in an emergency (out-of-scope scan #{n})",
    es: ". Úsalo solo en emergencia (lectura fuera de alcance n.º {n})",
    fr: ". À utiliser uniquement en urgence (lecture hors périmètre n° {n})",
    de: ". Nur im Notfall verwenden (Scan außerhalb des Bereichs Nr. {n})",
  },
  "Aponte a câmera para o QR code.": {
    en: "Point the camera at the QR code.",
    es: "Apunta la cámara al código QR.",
    fr: "Pointez la caméra vers le code QR.",
    de: "Richte die Kamera auf den QR-Code.",
  },
  "Esta criança": {
    en: "This child",
    es: "Este niño",
    fr: "Cet enfant",
    de: "Dieses Kind",
  },
  "Esse QR code não é de um crachá / pulseira do Acampa Kids.": {
    en: "This QR code is not an Acampa Kids badge / wristband.",
    es: "Este código QR no es de una credencial / pulsera de Acampa Kids.",
    fr: "Ce code QR n'est pas un badge / bracelet Acampa Kids.",
    de: "Dieser QR-Code gehört zu keinem Namensschild / Armband von Acampa Kids.",
  },
  "Fazendo check-in…": {
    en: "Checking in…",
    es: "Haciendo check-in…",
    fr: "Check-in en cours…",
    de: "Check-in läuft…",
  },
  "Fechar câmera": {
    en: "Close camera",
    es: "Cerrar cámara",
    fr: "Fermer la caméra",
    de: "Kamera schließen",
  },
  "Ler o crachá de qualquer criança": {
    en: "Scan any child's badge",
    es: "Leer la credencial de cualquier niño",
    fr: "Lire le badge de n'importe quel enfant",
    de: "Namensschild eines beliebigen Kindes scannen",
  },
  "Ler o crachá de qualquer criança (emergência)": {
    en: "Scan any child's badge (emergency)",
    es: "Leer la credencial de cualquier niño (emergencia)",
    fr: "Lire le badge de n'importe quel enfant (urgence)",
    de: "Namensschild eines beliebigen Kindes scannen (Notfall)",
  },
  "Ler outro": {
    en: "Scan another",
    es: "Leer otro",
    fr: "Lire un autre",
    de: "Weiteres scannen",
  },
  "Ler pulseira ou crachá": {
    en: "Scan wristband or badge",
    es: "Leer pulsera o credencial",
    fr: "Lire le bracelet ou le badge",
    de: "Armband oder Namensschild scannen",
  },
  "Não deu para ler": {
    en: "Couldn't read it",
    es: "No se pudo leer",
    fr: "Impossible de lire",
    de: "Konnte nicht gelesen werden",
  },
  "Não foi possível ler o crachá.": {
    en: "Couldn't read the badge.",
    es: "No se pudo leer la credencial.",
    fr: "Impossible de lire le badge.",
    de: "Das Namensschild konnte nicht gelesen werden.",
  },
  "não é do seu quarto": {
    en: "is not from your room",
    es: "no es de tu habitación",
    fr: "n'est pas de votre chambre",
    de: "ist nicht aus deinem Zimmer",
  },
};
