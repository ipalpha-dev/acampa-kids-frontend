import type { Locale } from "../locales";

/** Copy of the camp-operations screens after the people-in-IPAlpha rewrite (parent area, check-in, care, team home). */
export const LITERALS: Record<string, Partial<Record<Exclude<Locale, "pt">, string>>> = {
  // ── family (responsáveis) read live, contacts on tap ──
  "Família": { en: "Family", es: "Familia", fr: "Famille", de: "Familie" },
  "Ver os responsáveis de {name}": { en: "See who looks after {name}", es: "Ver a los responsables de {name}", fr: "Voir les responsables de {name}", de: "Bezugspersonen von {name} ansehen" },
  "Não foi possível ver a família agora.": { en: "We couldn't show the family right now.", es: "No fue posible ver a la familia ahora.", fr: "Impossible d'afficher la famille pour le moment.", de: "Die Familie kann gerade nicht angezeigt werden." },
  "Nenhum responsável ligado a esta criança.": { en: "No guardian is linked to this child yet.", es: "Todavía no hay un responsable vinculado a este niño.", fr: "Aucun responsable n'est encore lié à cet enfant.", de: "Mit diesem Kind ist noch keine Bezugsperson verknüpft." },

  // ── church check-in: health + family read live when a kid is opened ──
  "Lendo as informações de saúde e da família…": { en: "Reading the health and family details…", es: "Leyendo la información de salud y de la familia…", fr: "Lecture des informations de santé et de la famille…", de: "Gesundheits- und Familienangaben werden gelesen…" },
  "Não conseguimos ler as informações de saúde e da família agora.": { en: "We couldn't read the health and family details right now.", es: "No pudimos leer la información de salud y de la familia ahora.", fr: "Impossible de lire les informations de santé et de la famille pour le moment.", de: "Die Gesundheits- und Familienangaben konnten gerade nicht gelesen werden." },
  "com {name}": { en: "with {name}", es: "con {name}", fr: "avec {name}", de: "mit {name}" },

  // ── greetings / not found (no phone identity anymore) ──
  "Olá! 👋": { en: "Hello! 👋", es: "¡Hola! 👋", fr: "Bonjour ! 👋", de: "Hallo! 👋" },
  "Ainda não encontramos você na equipe deste acampamento.": { en: "We haven't found you on this camp's team yet.", es: "Todavía no te encontramos en el equipo de este campamento.", fr: "Nous ne vous avons pas encore trouvé dans l'équipe de ce camp.", de: "Wir haben dich noch nicht im Team dieses Camps gefunden." },
  "Ainda não encontramos nenhuma criança ligada a você neste acampamento.": { en: "We haven't found any child linked to you at this camp yet.", es: "Todavía no encontramos ningún niño vinculado a ti en este campamento.", fr: "Nous n'avons encore trouvé aucun enfant lié à vous dans ce camp.", de: "Wir haben in diesem Camp noch kein Kind gefunden, das mit dir verknüpft ist." },

  // ── parent area ──
  "sua criança": { en: "your child", es: "tu niño", fr: "votre enfant", de: "dein Kind" },
  "Não conseguimos ler as informações de saúde agora.": { en: "We couldn't read the health details right now.", es: "No pudimos leer la información de salud ahora.", fr: "Impossible de lire les informations de santé pour le moment.", de: "Die Gesundheitsangaben konnten gerade nicht gelesen werden." },
  "As informações de saúde de {name} não estão disponíveis para o seu perfil agora. Se precisar, fale com a coordenação — ela pode ajudar.": {
    en: "{name}'s health details aren't available to your profile right now. If you need them, talk to the coordinators — they can help.",
    es: "La información de salud de {name} no está disponible para tu perfil ahora. Si la necesitas, habla con la coordinación: puede ayudarte.",
    fr: "Les informations de santé de {name} ne sont pas disponibles pour votre profil pour le moment. Si besoin, parlez-en à la coordination : elle peut vous aider.",
    de: "Die Gesundheitsangaben von {name} sind für dein Profil gerade nicht verfügbar. Wenn du sie brauchst, sprich mit der Lagerleitung – sie hilft gern.",
  },
  "Não disponível para o seu perfil agora": { en: "Not available to your profile right now", es: "No disponible para tu perfil ahora", fr: "Pas disponible pour votre profil pour le moment", de: "Für dein Profil gerade nicht verfügbar" },
  "O IPAlpha não deixou salvar as informações de saúde pelo seu perfil. Nada foi alterado — fale com a coordenação, que pode ajudar.": {
    en: "IPAlpha didn't let your profile save the health details. Nothing was changed — talk to the coordinators, they can help.",
    es: "IPAlpha no permitió guardar la información de salud desde tu perfil. No se cambió nada: habla con la coordinación, puede ayudarte.",
    fr: "IPAlpha n'a pas permis d'enregistrer les informations de santé depuis votre profil. Rien n'a été modifié — parlez-en à la coordination, elle peut vous aider.",
    de: "IPAlpha hat das Speichern der Gesundheitsangaben über dein Profil nicht erlaubt. Es wurde nichts geändert – sprich mit der Lagerleitung, sie hilft gern.",
  },
  "Esses dados ficam no IPAlpha, em Meus dados.": { en: "These details live in IPAlpha, under My data.", es: "Estos datos están en IPAlpha, en Mis datos.", fr: "Ces informations se trouvent dans IPAlpha, dans Mes données.", de: "Diese Angaben findest du in IPAlpha unter Meine Daten." },
  "no IPAlpha, em Meus dados": { en: "in IPAlpha, under My data", es: "en IPAlpha, en Mis datos", fr: "dans IPAlpha, dans Mes données", de: "in IPAlpha unter Meine Daten" },
  "Ver contato de emergência e documentos": { en: "See emergency contact and documents", es: "Ver contacto de emergencia y documentos", fr: "Voir le contact d'urgence et les documents", de: "Notfallkontakt und Dokumente ansehen" },
  "O contato de emergência e os documentos ficam no IPAlpha: você revisa em Meus dados. O convênio você edita em Início → Informações de saúde.": {
    en: "The emergency contact and documents live in IPAlpha: you review them under My data. You edit the health plan in Home → Health information.",
    es: "El contacto de emergencia y los documentos están en IPAlpha: los revisas en Mis datos. El seguro médico lo editas en Inicio → Información de salud.",
    fr: "Le contact d'urgence et les documents se trouvent dans IPAlpha : vous les vérifiez dans Mes données. La mutuelle se modifie dans Accueil → Informations de santé.",
    de: "Notfallkontakt und Dokumente findest du in IPAlpha: Du prüfst sie unter Meine Daten. Die Krankenversicherung bearbeitest du unter Start → Gesundheitsangaben.",
  },
};
