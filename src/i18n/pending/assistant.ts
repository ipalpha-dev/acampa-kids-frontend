import type { Locale } from "../locales";

export const LITERALS: Record<string, Partial<Record<Exclude<Locale, "pt">, string>>> = {
  "Conversar com a Sareca": {
    en: "Talk with Sareca",
    es: "Hablar con Sareca",
    fr: "Parler avec Sareca",
    de: "Mit Sareca sprechen",
  },
  "Sareca, assistente do acampamento": {
    en: "Sareca, the camp assistant",
    es: "Sareca, la asistente del campamento",
    fr: "Sareca, l'assistante du camp",
    de: "Sareca, die Camp-Assistentin",
  },
  "Encerrar conversa": {
    en: "End conversation",
    es: "Terminar conversación",
    fr: "Terminer la conversation",
    de: "Gespräch beenden",
  },
  "Resposta exibida": {
    en: "On-screen reply",
    es: "Respuesta en pantalla",
    fr: "Réponse à l'écran",
    de: "Angezeigte Antwort",
  },
  "Assistente indisponível.": {
    en: "Assistant unavailable.",
    es: "Asistente no disponible.",
    fr: "Assistant indisponible.",
    de: "Assistent nicht verfügbar.",
  },
  "Conectando...": {
    en: "Connecting...",
    es: "Conectando...",
    fr: "Connexion...",
    de: "Verbinde...",
  },
  "A conversa caiu. Toque para tentar de novo.": {
    en: "The conversation dropped. Tap to try again.",
    es: "La conversación se cortó. Toca para intentarlo de nuevo.",
    fr: "La conversation s'est interrompue. Touchez pour réessayer.",
    de: "Das Gespräch wurde unterbrochen. Tippe, um es noch einmal zu versuchen.",
  },
  "O assistente não atendeu. Tente novamente.": {
    en: "The assistant didn't answer. Try again.",
    es: "El asistente no respondió. Inténtalo de nuevo.",
    fr: "L'assistant n'a pas répondu. Réessayez.",
    de: "Der Assistent hat nicht reagiert. Versuch es noch einmal.",
  },
  "Preciso do microfone para conversar. Libere o acesso nas permissões do navegador.": {
    en: "I need the microphone to talk. Allow access in the browser permissions.",
    es: "Necesito el micrófono para conversar. Permite el acceso en los permisos del navegador.",
    fr: "J'ai besoin du micro pour parler. Autorisez l'accès dans les permissions du navigateur.",
    de: "Ich brauche das Mikrofon, um mit dir zu sprechen. Erlaube den Zugriff in den Browser-Berechtigungen.",
  },
  "Não consegui abrir a conversa por voz.": {
    en: "I couldn't start the voice conversation.",
    es: "No pude abrir la conversación por voz.",
    fr: "Je n'ai pas pu ouvrir la conversation vocale.",
    de: "Ich konnte das Sprachgespräch nicht starten.",
  },
  "Não foi possível preparar a conexão de áudio. Tente novamente.": {
    en: "Couldn't prepare the audio connection. Try again.",
    es: "No se pudo preparar la conexión de audio. Inténtalo de nuevo.",
    fr: "Impossible de préparer la connexion audio. Réessayez.",
    de: "Die Audioverbindung konnte nicht vorbereitet werden. Versuch es noch einmal.",
  },
};
