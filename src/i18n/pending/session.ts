import type { Locale } from "../locales";

/** Opening a stored session (token only on the device; identity read with GET /api/auth/me). */
export const LITERALS: Record<string, Partial<Record<Exclude<Locale, "pt">, string>>> = {
  "Abrindo o acampamento…": { en: "Opening the camp…", es: "Abriendo el campamento…", fr: "Ouverture du camp…", de: "Das Camp wird geöffnet…" },
  "Sem conexão com o servidor agora. Assim que a internet voltar, a gente continua de onde parou.": {
    en: "No connection to the server right now. As soon as the internet is back, we'll pick up where we left off.",
    es: "Sin conexión con el servidor ahora. En cuanto vuelva internet, seguimos donde lo dejamos.",
    fr: "Pas de connexion au serveur pour le moment. Dès que la connexion revient, on reprend là où on s'était arrêtés.",
    de: "Gerade keine Verbindung zum Server. Sobald das Internet wieder da ist, machen wir dort weiter, wo wir aufgehört haben.",
  },
  "Entrar com outra conta": { en: "Sign in with another account", es: "Entrar con otra cuenta", fr: "Se connecter avec un autre compte", de: "Mit einem anderen Konto anmelden" },
};
