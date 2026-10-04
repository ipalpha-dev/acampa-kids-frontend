import { format, type Locale } from "./locales";

/** UI strings — named keys, PT source of truth. Grow this as screens are migrated. */
export type UiKey =
  // login
  | "login.phoneTitle"
  | "login.continue"
  | "login.sending"
  | "login.phoneInvalid"
  | "login.genericError"
  | "login.otpSentSms"
  | "login.otpSentMock"
  | "login.otpSentRedirect"
  | "login.otpTitle"
  | "login.verify"
  | "login.verifying"
  | "login.resend"
  | "login.resending"
  | "login.back"
  | "login.codeExpired"
  | "login.attemptsLeft"
  | "login.frozen"
  | "login.almostThere"
  | "login.chooseProfile"
  // IPAlpha sign-in + One Tap banner
  | "login.or"
  | "login.ipalpha"
  | "login.ipalphaOpening"
  | "login.ipalphaDenied"
  | "login.ipalphaFailed"
  | "login.ipalphaNoProfile"
  | "login.popupBlocked"
  | "login.ipalphaMisconfigured"
  | "login.ipalphaRateLimited"
  | "oneTap.title"
  // core unavailable ("em manutenção")
  | "maintenance.title"
  | "maintenance.text"
  | "maintenance.retry"
  | "maintenance.imageAlt"
  // common
  | "common.cancel"
  | "common.save"
  | "common.saving"
  | "common.delete"
  | "common.edit"
  | "common.close"
  | "common.back"
  | "common.search"
  | "common.loading"
  | "common.error"
  | "common.yes"
  | "common.no"
  | "common.all"
  | "common.none"
  | "common.continue"
  | "common.confirm"
  | "common.add"
  | "common.remove"
  | "common.open"
  | "common.seeMore"
  | "common.empty"
  | "common.retry"
  | "common.version"
  // roles
  | "role.parent"
  | "role.staff"
  | "role.health_staff"
  | "role.admin"
  // nav / home
  | "nav.home"
  | "nav.schedule"
  | "nav.instructions"
  | "nav.preparation"
  | "nav.photos"
  | "nav.checkin"
  | "nav.bus"
  | "nav.vest"
  | "nav.score"
  | "nav.medications"
  | "nav.occurrences"
  | "nav.settings"
  | "nav.logout"
  // search placeholders (shared)
  | "search.byName"
  | "search.person"
  | "search.child"
  | "search.event"
  | "search.role"
  | "search.camperStaff"
  | "search.score"
  | "search.meds"
  // access window
  | "access.ended"
  | "access.notYetStaff"
  | "access.notYetParent"
  | "access.dialogTitle"
  | "access.opensAt"
  | "access.closesAt";

type Catalog = Record<UiKey, string>;

const pt: Catalog = {
  "login.phoneTitle": "Qual é o seu celular?",
  "login.continue": "Continuar",
  "login.sending": "Enviando…",
  "login.phoneInvalid": "Digite um celular válido com DDD (ex.: (11) 98123-4567).",
  "login.genericError": "Algo deu errado. Tente novamente.",
  "login.otpSentSms": "Enviamos um SMS para {phone}",
  "login.otpSentMock": "Código gerado (modo desenvolvimento) para {phone}",
  "login.otpSentRedirect": "Código enviado ao celular de teste para {phone}",
  "login.otpTitle": "Digite o código",
  "login.verify": "Entrar",
  "login.verifying": "Verificando…",
  "login.resend": "Reenviar código",
  "login.resending": "Reenviando…",
  "login.back": "Voltar",
  "login.codeExpired": "O código expirou. Peça um novo.",
  "login.attemptsLeft": "{n} tentativa(s) restante(s).",
  "login.frozen": "Conta bloqueada por {minutes} minuto(s).",
  "login.almostThere": "Quase lá, {name}! 🏕️",
  "login.chooseProfile": "Com qual perfil você quer entrar?",
  "common.cancel": "Cancelar",
  "common.save": "Salvar",
  "common.saving": "Salvando…",
  "common.delete": "Excluir",
  "common.edit": "Editar",
  "common.close": "Fechar",
  "common.back": "Voltar",
  "common.search": "Buscar",
  "common.loading": "Carregando…",
  "common.error": "Algo deu errado.",
  "common.yes": "Sim",
  "common.no": "Não",
  "common.all": "Todos",
  "common.none": "Nenhum",
  "common.continue": "Continuar",
  "common.confirm": "Confirmar",
  "common.add": "Adicionar",
  "common.remove": "Remover",
  "common.open": "Abrir",
  "common.seeMore": "Ver mais",
  "common.empty": "Nada por aqui.",
  "common.retry": "Tentar de novo",
  "common.version": "Versão {version}",
  "role.parent": "Pais",
  "role.staff": "Equipe",
  "role.health_staff": "Equipe médica",
  "role.admin": "Organização",
  "nav.home": "Início",
  "nav.schedule": "Programação",
  "nav.instructions": "Instruções",
  "nav.preparation": "Preparação",
  "nav.photos": "Fotos",
  "nav.checkin": "Check-in",
  "nav.bus": "Ônibus",
  "nav.vest": "Coletes",
  "nav.score": "Placar",
  "nav.medications": "Medicações",
  "nav.occurrences": "Ocorrências",
  "nav.settings": "Configurações",
  "nav.logout": "Sair",
  "search.byName": "Buscar pelo nome…",
  "search.person": "Digite o nome…",
  "search.child": "Buscar criança…",
  "search.event": "Buscar evento, dia ou horário…",
  "search.role": "Buscar função…",
  "search.camperStaff": "Buscar por nome, líder, time, quarto…",
  "search.score": "Buscar criança, observação, pessoa…",
  "search.meds": "Procurar criança…",
  "access.ended": "O acampamento já terminou. Esperamos você no ano que vem!",
  "access.notYetStaff": "O app ainda não está liberado para a equipe.",
  "access.notYetParent": "O app ainda não está liberado para os pais.",
  "access.dialogTitle": "Acesso ainda não liberado",
  "access.opensAt": "Abre em {when}",
  "access.closesAt": "Fecha em {when}",
  "login.or": "ou",
  "login.ipalpha": "Entrar com IPAlpha",
  "login.ipalphaOpening": "Abrindo o IPAlpha…",
  "login.ipalphaDenied": "Tudo bem, você pode entrar com o celular.",
  "login.ipalphaFailed": "Não conseguimos entrar com o IPAlpha agora. Tente de novo ou entre com o celular.",
  "login.ipalphaNoProfile": "Ainda não encontramos você no acampamento deste ano. Entre com o celular cadastrado ou fale com a organização.",
  "login.popupBlocked": "O navegador bloqueou a janela do IPAlpha. Permita janelas pop-up para este site e tente de novo.",
  "login.ipalphaMisconfigured": "O login com IPAlpha não está disponível agora. Você pode entrar com o seu celular.",
  "login.ipalphaRateLimited": "Muitas tentativas em pouco tempo. Aguarde um minutinho e tente de novo, ou entre com o seu celular.",
  "oneTap.title": "Entrar com IPAlpha",
  "maintenance.title": "Estamos arrumando o acampamento!",
  "maintenance.text": "Volte daqui a pouquinho.",
  "maintenance.retry": "Tentar de novo",
  "maintenance.imageAlt": "Uma barraca alegre com uma plaquinha de obras, um sol sorridente e um cacto de capacete",
};

const en: Catalog = {
  "login.phoneTitle": "What's your mobile number?",
  "login.continue": "Continue",
  "login.sending": "Sending…",
  "login.phoneInvalid": "Enter a valid mobile with area code (e.g. (11) 98123-4567).",
  "login.genericError": "Something went wrong. Try again.",
  "login.otpSentSms": "We sent an SMS to {phone}",
  "login.otpSentMock": "Code generated (dev mode) for {phone}",
  "login.otpSentRedirect": "Code sent to the test phone for {phone}",
  "login.otpTitle": "Enter the code",
  "login.verify": "Sign in",
  "login.verifying": "Checking…",
  "login.resend": "Resend code",
  "login.resending": "Resending…",
  "login.back": "Back",
  "login.codeExpired": "The code expired. Request a new one.",
  "login.attemptsLeft": "{n} attempt(s) left.",
  "login.frozen": "Account locked for {minutes} minute(s).",
  "login.almostThere": "Almost there, {name}! 🏕️",
  "login.chooseProfile": "Which profile do you want to use?",
  "common.cancel": "Cancel",
  "common.save": "Save",
  "common.saving": "Saving…",
  "common.delete": "Delete",
  "common.edit": "Edit",
  "common.close": "Close",
  "common.back": "Back",
  "common.search": "Search",
  "common.loading": "Loading…",
  "common.error": "Something went wrong.",
  "common.yes": "Yes",
  "common.no": "No",
  "common.all": "All",
  "common.none": "None",
  "common.continue": "Continue",
  "common.confirm": "Confirm",
  "common.add": "Add",
  "common.remove": "Remove",
  "common.open": "Open",
  "common.seeMore": "See more",
  "common.empty": "Nothing here.",
  "common.retry": "Try again",
  "common.version": "Version {version}",
  "role.parent": "Parents",
  "role.staff": "Staff",
  "role.health_staff": "Medical team",
  "role.admin": "Organization",
  "nav.home": "Home",
  "nav.schedule": "Schedule",
  "nav.instructions": "Instructions",
  "nav.preparation": "Prep",
  "nav.photos": "Photos",
  "nav.checkin": "Check-in",
  "nav.bus": "Bus",
  "nav.vest": "Vests",
  "nav.score": "Scoreboard",
  "nav.medications": "Medications",
  "nav.occurrences": "Incidents",
  "nav.settings": "Settings",
  "nav.logout": "Sign out",
  "search.byName": "Search by name…",
  "search.person": "Type the name…",
  "search.child": "Search for a child…",
  "search.event": "Search event, day or time…",
  "search.role": "Search role…",
  "search.camperStaff": "Search by name, leader, team, room…",
  "search.score": "Search child, note, person…",
  "search.meds": "Find a child…",
  "access.ended": "Camp is over. See you next year!",
  "access.notYetStaff": "The app is not open for staff yet.",
  "access.notYetParent": "The app is not open for parents yet.",
  "access.dialogTitle": "Access not open yet",
  "access.opensAt": "Opens {when}",
  "access.closesAt": "Closes {when}",
  "login.or": "or",
  "login.ipalpha": "Sign in with IPAlpha",
  "login.ipalphaOpening": "Opening IPAlpha…",
  "login.ipalphaDenied": "That's okay — you can sign in with your phone.",
  "login.ipalphaFailed": "We couldn't sign you in with IPAlpha right now. Try again or sign in with your phone.",
  "login.ipalphaNoProfile": "We couldn't find you in this year's camp yet. Sign in with your registered phone or talk to the organizers.",
  "login.popupBlocked": "Your browser blocked the IPAlpha window. Allow pop-ups for this site and try again.",
  "login.ipalphaMisconfigured": "Signing in with IPAlpha isn't available right now. You can sign in with your phone.",
  "login.ipalphaRateLimited": "Lots of tries in a short time. Wait a minute and try again, or sign in with your phone.",
  "oneTap.title": "Sign in with IPAlpha",
  "maintenance.title": "We're tidying up the camp!",
  "maintenance.text": "Come back in a little while.",
  "maintenance.retry": "Try again",
  "maintenance.imageAlt": "A cheerful tent with a little construction sign, a smiling sun and a cactus in a hard hat",
};

const es: Catalog = {
  "login.phoneTitle": "¿Cuál es tu celular?",
  "login.continue": "Continuar",
  "login.sending": "Enviando…",
  "login.phoneInvalid": "Escribe un celular válido con código de área (ej.: (11) 98123-4567).",
  "login.genericError": "Algo salió mal. Inténtalo de nuevo.",
  "login.otpSentSms": "Enviamos un SMS a {phone}",
  "login.otpSentMock": "Código generado (modo desarrollo) para {phone}",
  "login.otpSentRedirect": "Código enviado al celular de prueba para {phone}",
  "login.otpTitle": "Escribe el código",
  "login.verify": "Entrar",
  "login.verifying": "Verificando…",
  "login.resend": "Reenviar código",
  "login.resending": "Reenviando…",
  "login.back": "Volver",
  "login.codeExpired": "El código expiró. Pide uno nuevo.",
  "login.attemptsLeft": "{n} intento(s) restante(s).",
  "login.frozen": "Cuenta bloqueada por {minutes} minuto(s).",
  "login.almostThere": "¡Casi listo, {name}! 🏕️",
  "login.chooseProfile": "¿Con qué perfil quieres entrar?",
  "common.cancel": "Cancelar",
  "common.save": "Guardar",
  "common.saving": "Guardando…",
  "common.delete": "Eliminar",
  "common.edit": "Editar",
  "common.close": "Cerrar",
  "common.back": "Volver",
  "common.search": "Buscar",
  "common.loading": "Cargando…",
  "common.error": "Algo salió mal.",
  "common.yes": "Sí",
  "common.no": "No",
  "common.all": "Todos",
  "common.none": "Ninguno",
  "common.continue": "Continuar",
  "common.confirm": "Confirmar",
  "common.add": "Añadir",
  "common.remove": "Quitar",
  "common.open": "Abrir",
  "common.seeMore": "Ver más",
  "common.empty": "Nada por aquí.",
  "common.retry": "Intentar de nuevo",
  "common.version": "Versión {version}",
  "role.parent": "Padres",
  "role.staff": "Equipo",
  "role.health_staff": "Equipo médico",
  "role.admin": "Organización",
  "nav.home": "Inicio",
  "nav.schedule": "Programación",
  "nav.instructions": "Instrucciones",
  "nav.preparation": "Preparación",
  "nav.photos": "Fotos",
  "nav.checkin": "Check-in",
  "nav.bus": "Autobús",
  "nav.vest": "Chalecos",
  "nav.score": "Marcador",
  "nav.medications": "Medicaciones",
  "nav.occurrences": "Incidentes",
  "nav.settings": "Ajustes",
  "nav.logout": "Salir",
  "search.byName": "Buscar por nombre…",
  "search.person": "Escribe el nombre…",
  "search.child": "Buscar niño…",
  "search.event": "Buscar evento, día u hora…",
  "search.role": "Buscar función…",
  "search.camperStaff": "Buscar por nombre, líder, equipo, habitación…",
  "search.score": "Buscar niño, nota, persona…",
  "search.meds": "Buscar niño…",
  "access.ended": "El campamento ya terminó. ¡Te esperamos el año que viene!",
  "access.notYetStaff": "La app aún no está liberada para el equipo.",
  "access.notYetParent": "La app aún no está liberada para los padres.",
  "access.dialogTitle": "Acceso aún no liberado",
  "access.opensAt": "Abre {when}",
  "access.closesAt": "Cierra {when}",
  "login.or": "o",
  "login.ipalpha": "Entrar con IPAlpha",
  "login.ipalphaOpening": "Abriendo IPAlpha…",
  "login.ipalphaDenied": "No pasa nada, puedes entrar con tu celular.",
  "login.ipalphaFailed": "No pudimos entrar con IPAlpha ahora. Inténtalo de nuevo o entra con tu celular.",
  "login.ipalphaNoProfile": "Todavía no te encontramos en el campamento de este año. Entra con el celular registrado o habla con la organización.",
  "login.popupBlocked": "El navegador bloqueó la ventana de IPAlpha. Permite las ventanas emergentes para este sitio e inténtalo de nuevo.",
  "login.ipalphaMisconfigured": "El acceso con IPAlpha no está disponible ahora. Puedes entrar con tu celular.",
  "login.ipalphaRateLimited": "Muchos intentos en poco tiempo. Espera un minuto e inténtalo de nuevo, o entra con tu celular.",
  "oneTap.title": "Entrar con IPAlpha",
  "maintenance.title": "¡Estamos ordenando el campamento!",
  "maintenance.text": "Vuelve en un ratito.",
  "maintenance.retry": "Intentar de nuevo",
  "maintenance.imageAlt": "Una carpa alegre con un cartelito de obras, un sol sonriente y un cactus con casco",
};

const fr: Catalog = {
  "login.phoneTitle": "Quel est votre portable ?",
  "login.continue": "Continuer",
  "login.sending": "Envoi…",
  "login.phoneInvalid": "Entrez un portable valide avec indicatif (ex. : (11) 98123-4567).",
  "login.genericError": "Une erreur s'est produite. Réessayez.",
  "login.otpSentSms": "Nous avons envoyé un SMS à {phone}",
  "login.otpSentMock": "Code généré (mode dev) pour {phone}",
  "login.otpSentRedirect": "Code envoyé au portable de test pour {phone}",
  "login.otpTitle": "Entrez le code",
  "login.verify": "Connexion",
  "login.verifying": "Vérification…",
  "login.resend": "Renvoyer le code",
  "login.resending": "Renvoi…",
  "login.back": "Retour",
  "login.codeExpired": "Le code a expiré. Demandez-en un nouveau.",
  "login.attemptsLeft": "{n} tentative(s) restante(s).",
  "login.frozen": "Compte bloqué pendant {minutes} minute(s).",
  "login.almostThere": "Presque prêt, {name} ! 🏕️",
  "login.chooseProfile": "Avec quel profil voulez-vous entrer ?",
  "common.cancel": "Annuler",
  "common.save": "Enregistrer",
  "common.saving": "Enregistrement…",
  "common.delete": "Supprimer",
  "common.edit": "Modifier",
  "common.close": "Fermer",
  "common.back": "Retour",
  "common.search": "Rechercher",
  "common.loading": "Chargement…",
  "common.error": "Une erreur s'est produite.",
  "common.yes": "Oui",
  "common.no": "Non",
  "common.all": "Tous",
  "common.none": "Aucun",
  "common.continue": "Continuer",
  "common.confirm": "Confirmer",
  "common.add": "Ajouter",
  "common.remove": "Retirer",
  "common.open": "Ouvrir",
  "common.seeMore": "Voir plus",
  "common.empty": "Rien ici.",
  "common.retry": "Réessayer",
  "common.version": "Version {version}",
  "role.parent": "Parents",
  "role.staff": "Équipe",
  "role.health_staff": "Équipe médicale",
  "role.admin": "Organisation",
  "nav.home": "Accueil",
  "nav.schedule": "Programme",
  "nav.instructions": "Instructions",
  "nav.preparation": "Préparation",
  "nav.photos": "Photos",
  "nav.checkin": "Check-in",
  "nav.bus": "Bus",
  "nav.vest": "Gilets",
  "nav.score": "Score",
  "nav.medications": "Médicaments",
  "nav.occurrences": "Incidents",
  "nav.settings": "Réglages",
  "nav.logout": "Déconnexion",
  "search.byName": "Rechercher par nom…",
  "search.person": "Tapez le nom…",
  "search.child": "Rechercher un enfant…",
  "search.event": "Rechercher événement, jour ou heure…",
  "search.role": "Rechercher une fonction…",
  "search.camperStaff": "Rechercher par nom, leader, équipe, chambre…",
  "search.score": "Rechercher enfant, note, personne…",
  "search.meds": "Trouver un enfant…",
  "access.ended": "Le camp est terminé. À l'année prochaine !",
  "access.notYetStaff": "L'appli n'est pas encore ouverte pour l'équipe.",
  "access.notYetParent": "L'appli n'est pas encore ouverte pour les parents.",
  "access.dialogTitle": "Accès pas encore ouvert",
  "access.opensAt": "Ouvre {when}",
  "access.closesAt": "Ferme {when}",
  "login.or": "ou",
  "login.ipalpha": "Se connecter avec IPAlpha",
  "login.ipalphaOpening": "Ouverture d'IPAlpha…",
  "login.ipalphaDenied": "Pas de souci, vous pouvez vous connecter avec votre portable.",
  "login.ipalphaFailed": "Impossible de vous connecter avec IPAlpha pour le moment. Réessayez ou connectez-vous avec votre portable.",
  "login.ipalphaNoProfile": "Nous ne vous trouvons pas encore dans le camp de cette année. Connectez-vous avec le portable enregistré ou parlez à l'organisation.",
  "login.popupBlocked": "Le navigateur a bloqué la fenêtre IPAlpha. Autorisez les fenêtres pop-up pour ce site et réessayez.",
  "login.ipalphaMisconfigured": "La connexion avec IPAlpha n'est pas disponible pour le moment. Vous pouvez vous connecter avec votre portable.",
  "login.ipalphaRateLimited": "Beaucoup de tentatives en peu de temps. Patientez une minute et réessayez, ou connectez-vous avec votre portable.",
  "oneTap.title": "Se connecter avec IPAlpha",
  "maintenance.title": "On range le camp !",
  "maintenance.text": "Revenez dans un petit moment.",
  "maintenance.retry": "Réessayer",
  "maintenance.imageAlt": "Une tente joyeuse avec un petit panneau de travaux, un soleil souriant et un cactus avec un casque",
};

const de: Catalog = {
  "login.phoneTitle": "Wie lautet deine Handynummer?",
  "login.continue": "Weiter",
  "login.sending": "Wird gesendet…",
  "login.phoneInvalid": "Gib eine gültige Handynummer mit Vorwahl ein (z. B. (11) 98123-4567).",
  "login.genericError": "Etwas ist schiefgelaufen. Versuch es noch einmal.",
  "login.otpSentSms": "Wir haben eine SMS an {phone} geschickt",
  "login.otpSentMock": "Code erzeugt (Entwicklungsmodus) für {phone}",
  "login.otpSentRedirect": "Code an das Testhandy für {phone} gesendet",
  "login.otpTitle": "Gib den Code ein",
  "login.verify": "Anmelden",
  "login.verifying": "Wird geprüft…",
  "login.resend": "Code erneut senden",
  "login.resending": "Wird erneut gesendet…",
  "login.back": "Zurück",
  "login.codeExpired": "Der Code ist abgelaufen. Fordere einen neuen an.",
  "login.attemptsLeft": "Noch {n} Versuch(e).",
  "login.frozen": "Konto für {minutes} Minute(n) gesperrt.",
  "login.almostThere": "Fast geschafft, {name}! 🏕️",
  "login.chooseProfile": "Mit welchem Profil möchtest du dich anmelden?",
  "common.cancel": "Abbrechen",
  "common.save": "Speichern",
  "common.saving": "Wird gespeichert…",
  "common.delete": "Löschen",
  "common.edit": "Bearbeiten",
  "common.close": "Schließen",
  "common.back": "Zurück",
  "common.search": "Suchen",
  "common.loading": "Wird geladen…",
  "common.error": "Etwas ist schiefgelaufen.",
  "common.yes": "Ja",
  "common.no": "Nein",
  "common.all": "Alle",
  "common.none": "Keine",
  "common.continue": "Weiter",
  "common.confirm": "Bestätigen",
  "common.add": "Hinzufügen",
  "common.remove": "Entfernen",
  "common.open": "Öffnen",
  "common.seeMore": "Mehr anzeigen",
  "common.empty": "Hier ist noch nichts.",
  "common.retry": "Noch einmal versuchen",
  "common.version": "Version {version}",
  "role.parent": "Eltern",
  "role.staff": "Mitarbeitende",
  "role.health_staff": "Gesundheitsteam",
  "role.admin": "Organisation",
  "nav.home": "Start",
  "nav.schedule": "Programm",
  "nav.instructions": "Hinweise",
  "nav.preparation": "Vorbereitung",
  "nav.photos": "Fotos",
  "nav.checkin": "Check-in",
  "nav.bus": "Bus",
  "nav.vest": "Westen",
  "nav.score": "Punktestand",
  "nav.medications": "Medikamente",
  "nav.occurrences": "Vorkommnisse",
  "nav.settings": "Einstellungen",
  "nav.logout": "Abmelden",
  "search.byName": "Nach Namen suchen…",
  "search.person": "Namen eingeben…",
  "search.child": "Kind suchen…",
  "search.event": "Programmpunkt, Tag oder Uhrzeit suchen…",
  "search.role": "Aufgabe suchen…",
  "search.camperStaff": "Nach Name, Leitung, Team, Zimmer suchen…",
  "search.score": "Kind, Notiz, Person suchen…",
  "search.meds": "Kind finden…",
  "access.ended": "Das Camp ist vorbei. Wir freuen uns auf dich im nächsten Jahr!",
  "access.notYetStaff": "Die App ist für die Mitarbeitenden noch nicht freigegeben.",
  "access.notYetParent": "Die App ist für die Eltern noch nicht freigegeben.",
  "access.dialogTitle": "Zugang noch nicht freigegeben",
  "access.opensAt": "Öffnet {when}",
  "access.closesAt": "Schließt {when}",
  "login.or": "oder",
  "login.ipalpha": "Mit IPAlpha anmelden",
  "login.ipalphaOpening": "IPAlpha wird geöffnet…",
  "login.ipalphaDenied": "Alles gut – du kannst dich auch mit deinem Handy anmelden.",
  "login.ipalphaFailed": "Die Anmeldung mit IPAlpha hat gerade nicht geklappt. Versuch es noch einmal oder melde dich mit deinem Handy an.",
  "login.ipalphaNoProfile": "Wir haben dich im Camp dieses Jahres noch nicht gefunden. Melde dich mit deiner hinterlegten Handynummer an oder sprich mit der Organisation.",
  "login.popupBlocked": "Dein Browser hat das IPAlpha-Fenster blockiert. Erlaube Pop-ups für diese Seite und versuch es noch einmal.",
  "login.ipalphaMisconfigured": "Die Anmeldung mit IPAlpha ist gerade nicht verfügbar. Du kannst dich mit deinem Handy anmelden.",
  "login.ipalphaRateLimited": "Viele Versuche in kurzer Zeit. Warte eine Minute und versuch es noch einmal, oder melde dich mit deinem Handy an.",
  "oneTap.title": "Mit IPAlpha anmelden",
  "maintenance.title": "Wir räumen gerade das Camp auf!",
  "maintenance.text": "Schau gleich noch mal vorbei.",
  "maintenance.retry": "Noch einmal versuchen",
  "maintenance.imageAlt": "Ein fröhliches Zelt mit einem kleinen Baustellenschild, einer lächelnden Sonne und einem Kaktus mit Bauhelm",
};

const CATALOGS: Record<Locale, Catalog> = { pt, en, es, fr, de };

export function t(locale: Locale, key: UiKey, vars: Record<string, string | number> = {}): string {
  const catalog = CATALOGS[locale] ?? pt;
  return format(catalog[key] ?? pt[key] ?? key, vars);
}
