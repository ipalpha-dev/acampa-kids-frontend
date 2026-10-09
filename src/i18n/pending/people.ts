import type { Locale } from "../locales";

/** Copy of the people-in-IPAlpha rewrite (roles, sessions, offline copy, people lists, templates). */
export const LITERALS: Record<string, Partial<Record<Exclude<Locale, "pt">, string>>> = {
  // ── roles (CONTRACTS §10) — how someone serves, never a rank ──
  "Coordenação": { en: "Coordination", es: "Coordinación", fr: "Coordination", de: "Koordination" },
  "Cuida de todo o acampamento": { en: "Looks after the whole camp", es: "Cuida de todo el campamento", fr: "Prend soin de tout le camp", de: "Kümmert sich um das ganze Camp" },
  "Organização": { en: "Organization", es: "Organización", fr: "Organisation", de: "Organisation" },
  "Ajuda a coordenar o acampamento": { en: "Helps coordinate the camp", es: "Ayuda a coordinar el campamento", fr: "Aide à coordonner le camp", de: "Hilft bei der Koordination des Camps" },
  "Organização dos jogos": { en: "Games organization", es: "Organización de los juegos", fr: "Organisation des jeux", de: "Spielorganisation" },
  "Programação e placar das brincadeiras": { en: "Schedule and scoreboard of the games", es: "Programación y marcador de los juegos", fr: "Programme et tableau des scores des jeux", de: "Programm und Punktestand der Spiele" },
  "Pontuação": { en: "Scoring", es: "Puntuación", fr: "Points", de: "Punkte" },
  "Registra os pontos das brincadeiras": { en: "Records the points of the games", es: "Registra los puntos de los juegos", fr: "Enregistre les points des jeux", de: "Trägt die Punkte der Spiele ein" },
  "Equipe de cuidado": { en: "Care team", es: "Equipo de cuidado", fr: "Équipe de soin", de: "Fürsorge-Team" },
  "Saúde e bem-estar de todos": { en: "Everyone's health and well-being", es: "Salud y bienestar de todos", fr: "Santé et bien-être de tous", de: "Gesundheit und Wohlbefinden aller" },
  "Entrega e recolhe os coletes da equipe": { en: "Hands out and collects the team vests", es: "Entrega y recoge los chalecos del equipo", fr: "Distribue et récupère les gilets de l'équipe", de: "Gibt die Westen des Teams aus und sammelt sie ein" },
  "Fotografia": { en: "Photography", es: "Fotografía", fr: "Photographie", de: "Fotografie" },
  "Guarda os momentos do acampamento": { en: "Keeps the camp's moments", es: "Guarda los momentos del campamento", fr: "Garde les moments du camp", de: "Hält die Momente des Camps fest" },
  "Check-in na igreja": { en: "Church check-in", es: "Check-in en la iglesia", fr: "Accueil à l'église", de: "Check-in in der Kirche" },
  "Recebe as famílias na chegada": { en: "Welcomes the families on arrival", es: "Recibe a las familias a su llegada", fr: "Accueille les familles à l'arrivée", de: "Empfängt die Familien bei der Ankunft" },
  "Check-in do ônibus": { en: "Bus check-in", es: "Check-in del autobús", fr: "Embarquement du bus", de: "Bus-Check-in" },
  "Confere quem embarca": { en: "Checks who boards", es: "Confirma quién sube", fr: "Vérifie qui embarque", de: "Prüft, wer einsteigt" },
  "Quem serve nos quartos e atividades": { en: "Serves in the rooms and activities", es: "Quien sirve en las habitaciones y actividades", fr: "Sert dans les chambres et les activités", de: "Dient in den Zimmern und bei den Aktivitäten" },
  "Responsável": { en: "Guardian", es: "Responsable", fr: "Responsable", de: "Bezugsperson" },
  "Acompanhe sua criança na aventura!": { en: "Follow your child on the adventure!", es: "¡Acompaña a tu niño en la aventura!", fr: "Suivez votre enfant dans l'aventure !", de: "Begleite dein Kind auf dem Abenteuer!" },

  // ── sign-in, profile ──
  "Foram muitas tentativas, então a conta ficou bloqueada por segurança. Espere {n} minuto(s) e tente de novo.": {
    en: "Too many tries, so the account was locked for safety. Wait {n} minute(s) and try again.",
    es: "Hubo demasiados intentos, así que la cuenta se bloqueó por seguridad. Espera {n} minuto(s) e inténtalo de nuevo.",
    fr: "Trop d'essais, le compte a été bloqué par sécurité. Attendez {n} minute(s) et réessayez.",
    de: "Zu viele Versuche, deshalb ist das Konto zur Sicherheit gesperrt. Warte {n} Minute(n) und versuch es noch einmal.",
  },
  "Boas-vindas! 🎉": { en: "Welcome! 🎉", es: "¡Bienvenida! 🎉", fr: "Bienvenue ! 🎉", de: "Willkommen! 🎉" },
  "Seus dados pessoais (celular, e-mail, saúde) ficam guardados no IPAlpha, em Meus dados.": {
    en: "Your personal data (phone, email, health) is kept in IPAlpha, under My data.",
    es: "Tus datos personales (celular, correo, salud) se guardan en IPAlpha, en Mis datos.",
    fr: "Vos données personnelles (téléphone, e-mail, santé) sont conservées dans IPAlpha, dans Mes données.",
    de: "Deine persönlichen Daten (Handy, E-Mail, Gesundheit) liegen in IPAlpha unter Meine Daten.",
  },
  "Versão {version}": { en: "Version {version}", es: "Versión {version}", fr: "Version {version}", de: "Version {version}" },

  // ── roles live in IPAlpha ──
  "Quem serve na coordenação é definido no IPAlpha (Oikos → Projetos → Acampa Kids → Papéis).": {
    en: "Who serves in the coordination is set in IPAlpha (Oikos → Projects → Acampa Kids → Roles).",
    es: "Quién sirve en la coordinación se define en IPAlpha (Oikos → Proyectos → Acampa Kids → Papeles).",
    fr: "Qui sert dans la coordination se définit dans IPAlpha (Oikos → Projets → Acampa Kids → Rôles).",
    de: "Wer in der Koordination dient, wird in IPAlpha festgelegt (Oikos → Projekte → Acampa Kids → Rollen).",
  },
  "Copiar link do app": { en: "Copy the app link", es: "Copiar el enlace de la app", fr: "Copier le lien de l'appli", de: "App-Link kopieren" },
  "Quem ajuda no check-in é quem tem o papel “Check-in na igreja” no IPAlpha (Oikos → Projetos → Acampa Kids). Durante a janela, essas pessoas veem todas as crianças.": {
    en: "The check-in helpers are whoever holds the “Church check-in” role in IPAlpha (Oikos → Projects → Acampa Kids). During the window they see every child.",
    es: "Quien ayuda en el check-in es quien tiene el papel “Check-in en la iglesia” en IPAlpha (Oikos → Proyectos → Acampa Kids). Durante la ventana ven a todos los niños.",
    fr: "Les aides à l'accueil sont les personnes ayant le rôle « Accueil à l'église » dans IPAlpha (Oikos → Projets → Acampa Kids). Pendant la fenêtre, elles voient tous les enfants.",
    de: "Beim Check-in helfen alle mit der Rolle „Check-in in der Kirche“ in IPAlpha (Oikos → Projekte → Acampa Kids). Während des Zeitfensters sehen sie alle Kinder.",
  },
  "Os avisos saem por SMS e e-mail pelo IPAlpha; os textos são cuidados no portal de desenvolvedores do IPAlpha. Ligue-os aqui ou um a um em Notificações.": {
    en: "Notices go out by SMS and email through IPAlpha; their texts are kept in the IPAlpha developers portal. Turn them on here or one by one in Notifications.",
    es: "Los avisos salen por SMS y correo a través de IPAlpha; sus textos se cuidan en el portal de desarrolladores de IPAlpha. Actívalos aquí o uno a uno en Notificaciones.",
    fr: "Les avis partent par SMS et e-mail via IPAlpha ; leurs textes sont gérés dans le portail développeurs d'IPAlpha. Activez-les ici ou un par un dans Notifications.",
    de: "Hinweise gehen per SMS und E-Mail über IPAlpha raus; ihre Texte werden im IPAlpha-Entwicklerportal gepflegt. Schalte sie hier oder einzeln unter Benachrichtigungen ein.",
  },
  "As janelas de acesso e de check-in e os avisos. Quem serve em cada papel (organização, saúde, check-in…) é definido no IPAlpha. Cada card salva por si — nada precisa ser preenchido de uma vez.": {
    en: "The access and check-in windows and the notices. Who serves in each role (organization, health, check-in…) is set in IPAlpha. Each card saves on its own — nothing has to be filled in at once.",
    es: "Las ventanas de acceso y de check-in y los avisos. Quién sirve en cada papel (organización, salud, check-in…) se define en IPAlpha. Cada tarjeta se guarda sola — nada tiene que llenarse de una vez.",
    fr: "Les fenêtres d'accès et d'accueil et les avis. Qui sert dans chaque rôle (organisation, santé, accueil…) se définit dans IPAlpha. Chaque carte s'enregistre seule — rien ne doit être rempli d'un coup.",
    de: "Die Zugangs- und Check-in-Zeitfenster und die Hinweise. Wer in welcher Rolle dient (Organisation, Gesundheit, Check-in…), wird in IPAlpha festgelegt. Jede Karte speichert für sich — nichts muss auf einmal ausgefüllt werden.",
  },

  // ── strings that had no translation yet ──
  "A distribuição falhou ao iniciar.": { en: "The distribution failed to start.", es: "La distribución no pudo iniciarse.", fr: "La répartition n'a pas pu démarrer.", de: "Die Verteilung konnte nicht starten." },
  "Não foi possível ler a resposta da distribuição.": { en: "Could not read the distribution's answer.", es: "No se pudo leer la respuesta de la distribución.", fr: "Impossible de lire la réponse de la répartition.", de: "Die Antwort der Verteilung konnte nicht gelesen werden." },
  "Como escolher os quartos": { en: "How to choose the rooms", es: "Cómo elegir las habitaciones", fr: "Comment choisir les chambres", de: "Wie die Zimmer gewählt werden" },
  "Por idade e sexo": { en: "By age and sex", es: "Por edad y sexo", fr: "Par âge et sexe", de: "Nach Alter und Geschlecht" },
  "acima da lotação": { en: "over capacity", es: "por encima de la capacidad", fr: "au-delà de la capacité", de: "über der Kapazität" },
  "quartos com idades misturadas": { en: "rooms with mixed ages", es: "habitaciones con edades mezcladas", fr: "chambres aux âges mélangés", de: "Zimmer mit gemischtem Alter" },
  "Todas as idades": { en: "All ages", es: "Todas las edades", fr: "Tous les âges", de: "Alle Altersgruppen" },
  "De": { en: "From", es: "De", fr: "De", de: "Von" },
  "anos": { en: "years", es: "años", fr: "ans", de: "Jahre" },
  "criança": { en: "child", es: "niño", fr: "enfant", de: "Kind" },
  "Arraste na área para selecionar vários quartos": { en: "Drag across the area to select several rooms", es: "Arrastra en el área para seleccionar varias habitaciones", fr: "Faites glisser dans la zone pour sélectionner plusieurs chambres", de: "Zieh über die Fläche, um mehrere Zimmer auszuwählen" },
  "camas de criança": { en: "children's beds", es: "camas de niño", fr: "lits d'enfant", de: "Kinderbetten" },
  "— não cabem todas": { en: "— not everyone fits", es: "— no caben todos", fr: "— tout le monde ne tient pas", de: "— nicht alle passen" },
  "— cabem": { en: "— everyone fits", es: "— caben", fr: "— tout le monde tient", de: "— alle passen" },
  "{when} · Isso não pode ser desfeito.": { en: "{when} · This cannot be undone.", es: "{when} · Esto no se puede deshacer.", fr: "{when} · Cette action est irréversible.", de: "{when} · Das kann nicht rückgängig gemacht werden." },
  "Administradores": { en: "Administrators", es: "Administradores", fr: "Administrateurs", de: "Admins" },
  "As correspondências que a importação de equipe e de acampantes guarda (coluna da planilha → valor do app). Limpar não apaga nenhum cadastro.": {
    en: "The matches the team and camper imports keep (spreadsheet column → app value). Clearing deletes no record.",
    es: "Las correspondencias que guarda la importación de equipo y campistas (columna de la planilla → valor de la app). Limpiar no borra ningún registro.",
    fr: "Les correspondances que gardent les imports d'équipe et de campeurs (colonne du tableur → valeur de l'appli). Effacer ne supprime aucune fiche.",
    de: "Die Zuordnungen, die der Import von Team und Kindern speichert (Tabellenspalte → App-Wert). Leeren löscht keine Angaben.",
  },
  "Etapa {n} de {total}": { en: "Step {n} of {total}", es: "Paso {n} de {total}", fr: "Étape {n} sur {total}", de: "Schritt {n} von {total}" },

  // ── people lists, contacts ──
  "Tem informações de saúde": { en: "Has health information", es: "Tiene información de salud", fr: "A des informations de santé", de: "Hat Gesundheitsangaben" },
  "Tem informações de saúde — veja na página da pessoa": { en: "Has health information — see the person's page", es: "Tiene información de salud — mírala en la página de la persona", fr: "A des informations de santé — voir la page de la personne", de: "Hat Gesundheitsangaben — siehe Seite der Person" },
  "Filtrar por saúde": { en: "Filter by health", es: "Filtrar por salud", fr: "Filtrer par santé", de: "Nach Gesundheit filtern" },
  "Ver contato": { en: "See contact", es: "Ver contacto", fr: "Voir le contact", de: "Kontakt anzeigen" },
  "Não foi possível ver o contato agora.": { en: "Could not show the contact right now.", es: "No se pudo ver el contacto ahora.", fr: "Impossible d'afficher le contact pour le moment.", de: "Der Kontakt kann gerade nicht angezeigt werden." },
  "Sem celular cadastrado.": { en: "No phone on record.", es: "Sin celular registrado.", fr: "Aucun portable enregistré.", de: "Keine Handynummer hinterlegt." },
  "a pessoa": { en: "the person", es: "la persona", fr: "la personne", de: "die Person" },
  "Mandamos um código por SMS para o seu celular cadastrado no IPAlpha.": { en: "We sent a code by SMS to your phone registered in IPAlpha.", es: "Enviamos un código por SMS a tu celular registrado en IPAlpha.", fr: "Nous avons envoyé un code par SMS à votre portable enregistré dans IPAlpha.", de: "Wir haben dir einen Code per SMS an deine in IPAlpha hinterlegte Nummer geschickt." },
  "O IPAlpha está em manutenção agora. O acampamento continua funcionando com o que já está no aparelho.": {
    en: "IPAlpha is under maintenance right now. The camp keeps working with what is already on the device.",
    es: "IPAlpha está en mantenimiento ahora. El campamento sigue funcionando con lo que ya está en el dispositivo.",
    fr: "IPAlpha est en maintenance pour le moment. Le camp continue de fonctionner avec ce qui est déjà sur l'appareil.",
    de: "IPAlpha wird gerade gewartet. Das Camp läuft mit dem weiter, was schon auf dem Gerät ist.",
  },
};
