import type { Locale } from "../locales";

/** Team (equipe) screens after the people-in-IPAlpha rewrite (group `staff`). */
export const LITERALS: Record<string, Partial<Record<Exclude<Locale, "pt">, string>>> = {
  // ── list / page ──
  "Carregando nome…": { en: "Loading name…", es: "Cargando nombre…", fr: "Chargement du nom…", de: "Name wird geladen…" },
  "Buscar por nome, time, quarto…": { en: "Search by name, team, room…", es: "Buscar por nombre, equipo, habitación…", fr: "Rechercher par nom, équipe, chambre…", de: "Nach Name, Team, Zimmer suchen…" },
  "Tirar {name} da equipe?": { en: "Take {name} off the team?", es: "¿Quitar a {name} del equipo?", fr: "Retirer {name} de l'équipe ?", de: "{name} aus dem Team nehmen?" },
  "Tirar {name} da equipe": { en: "Take {name} off the team", es: "Quitar a {name} del equipo", fr: "Retirer {name} de l'équipe", de: "{name} aus dem Team nehmen" },
  "Tirar da equipe": { en: "Take off the team", es: "Quitar del equipo", fr: "Retirer de l'équipe", de: "Aus dem Team nehmen" },
  "A pessoa sai da equipe deste acampamento. O cadastro dela no IPAlpha continua.": {
    en: "The person leaves this camp's team. Their IPAlpha profile stays.",
    es: "La persona sale del equipo de este campamento. Su registro en IPAlpha se mantiene.",
    fr: "La personne quitte l'équipe de ce camp. Sa fiche IPAlpha reste.",
    de: "Die Person verlässt das Team dieses Camps. Ihr IPAlpha-Profil bleibt bestehen.",
  },
  "Este celular já era de alguém no IPAlpha: essa pessoa entrou na equipe.": {
    en: "This phone already belonged to someone in IPAlpha: that person joined the team.",
    es: "Este celular ya era de alguien en IPAlpha: esa persona entró al equipo.",
    fr: "Ce portable appartenait déjà à quelqu'un dans IPAlpha : cette personne a rejoint l'équipe.",
    de: "Diese Handynummer gehörte schon jemandem in IPAlpha: Diese Person ist dem Team beigetreten.",
  },
  "Preparando {done}/{total}…": { en: "Preparing {done}/{total}…", es: "Preparando {done}/{total}…", fr: "Préparation {done}/{total}…", de: "Wird vorbereitet {done}/{total}…" },

  // ── person page ──
  "Contato": { en: "Contact", es: "Contacto", fr: "Contact", de: "Kontakt" },
  "Carregando informações de saúde…": { en: "Loading health information…", es: "Cargando información de salud…", fr: "Chargement des informations de santé…", de: "Gesundheitsinformationen werden geladen…" },
  "Não foi possível ler as informações de saúde agora.": {
    en: "Couldn't read the health information right now.",
    es: "No fue posible leer la información de salud ahora.",
    fr: "Impossible de lire les informations de santé pour le moment.",
    de: "Die Gesundheitsinformationen konnten gerade nicht gelesen werden.",
  },

  // ── add / edit form ──
  "Como incluir a pessoa": { en: "How to add the person", es: "Cómo incluir a la persona", fr: "Comment ajouter la personne", de: "Wie die Person hinzugefügt wird" },
  "Já está no IPAlpha": { en: "Already in IPAlpha", es: "Ya está en IPAlpha", fr: "Déjà dans IPAlpha", de: "Schon in IPAlpha" },
  "Busque quem já faz parte da equipe do acampamento no IPAlpha.": {
    en: "Find someone who is already on the camp team in IPAlpha.",
    es: "Busca a quien ya forma parte del equipo del campamento en IPAlpha.",
    fr: "Cherchez quelqu'un qui fait déjà partie de l'équipe du camp dans IPAlpha.",
    de: "Suche jemanden, der schon zum Camp-Team in IPAlpha gehört.",
  },
  "Cadastrar pessoa nova": { en: "Register a new person", es: "Registrar persona nueva", fr: "Inscrire une nouvelle personne", de: "Neue Person anlegen" },
  "Nome e celular — é por ele que a pessoa entra no app.": {
    en: "Name and mobile — it's how the person signs in to the app.",
    es: "Nombre y celular: con él la persona entra a la app.",
    fr: "Nom et portable — c'est avec lui que la personne se connecte à l'app.",
    de: "Name und Handynummer — damit meldet sich die Person in der App an.",
  },
  "🔎 Quem vai servir": { en: "🔎 Who will serve", es: "🔎 Quién va a servir", fr: "🔎 Qui va servir", de: "🔎 Wer mitdient" },
  "Buscar pessoa no IPAlpha": { en: "Search a person in IPAlpha", es: "Buscar persona en IPAlpha", fr: "Rechercher une personne dans IPAlpha", de: "Person in IPAlpha suchen" },
  "Digite pelo menos 2 letras do nome.": { en: "Type at least 2 letters of the name.", es: "Escribe al menos 2 letras del nombre.", fr: "Tapez au moins 2 lettres du nom.", de: "Gib mindestens 2 Buchstaben des Namens ein." },
  "Buscando…": { en: "Searching…", es: "Buscando…", fr: "Recherche…", de: "Suche läuft…" },
  "Não foi possível buscar agora.": { en: "Couldn't search right now.", es: "No fue posible buscar ahora.", fr: "Recherche impossible pour le moment.", de: "Die Suche ist gerade nicht möglich." },
  "Ninguém encontrado. Se a pessoa ainda não está no IPAlpha, use “Cadastrar pessoa nova”.": {
    en: "Nobody found. If the person isn't in IPAlpha yet, use “Register a new person”.",
    es: "No se encontró a nadie. Si la persona aún no está en IPAlpha, usa “Registrar persona nueva”.",
    fr: "Aucune personne trouvée. Si elle n'est pas encore dans IPAlpha, utilisez « Inscrire une nouvelle personne ».",
    de: "Niemand gefunden. Wenn die Person noch nicht in IPAlpha ist, nutze „Neue Person anlegen“.",
  },
  "Pessoas encontradas": { en: "People found", es: "Personas encontradas", fr: "Personnes trouvées", de: "Gefundene Personen" },
  "já está na equipe": { en: "already on the team", es: "ya está en el equipo", fr: "déjà dans l'équipe", de: "schon im Team" },
  "👤 Pessoa nova no IPAlpha": { en: "👤 New person in IPAlpha", es: "👤 Persona nueva en IPAlpha", fr: "👤 Nouvelle personne dans IPAlpha", de: "👤 Neue Person in IPAlpha" },
  "Sexo (opcional)": { en: "Sex (optional)", es: "Sexo (opcional)", fr: "Sexe (facultatif)", de: "Geschlecht (optional)" },
  "Igreja onde congrega (opcional)": { en: "Home church (optional)", es: "Iglesia donde se congrega (opcional)", fr: "Église fréquentée (facultatif)", de: "Heimatgemeinde (optional)" },
  "ex.: IP Alphaville": { en: "e.g. IP Alphaville", es: "ej.: IP Alphaville", fr: "ex. : IP Alphaville", de: "z. B. IP Alphaville" },
  "📞 Contato de emergência (opcional)": { en: "📞 Emergency contact (optional)", es: "📞 Contacto de emergencia (opcional)", fr: "📞 Contact d'urgence (facultatif)", de: "📞 Notfallkontakt (optional)" },
  "Nome do contato": { en: "Contact name", es: "Nombre del contacto", fr: "Nom du contact", de: "Name des Kontakts" },
  "Celular do contato": { en: "Contact's mobile", es: "Celular del contacto", fr: "Portable du contact", de: "Handynummer des Kontakts" },
  "Quem é (opcional)": { en: "Who they are (optional)", es: "Quién es (opcional)", fr: "Qui c'est (facultatif)", de: "Wer das ist (optional)" },
  "ex.: irmã, amigo": { en: "e.g. sister, friend", es: "ej.: hermana, amigo", fr: "ex. : sœur, ami", de: "z. B. Schwester, Freund" },
  "Informe o nome e um celular válido com DDD.": {
    en: "Enter the name and a valid mobile with area code.",
    es: "Indica el nombre y un celular válido con código de área.",
    fr: "Indiquez le nom et un portable valide avec l'indicatif.",
    de: "Gib den Namen und eine gültige Handynummer mit Vorwahl ein.",
  },
  "📝 Observações do acampamento": { en: "📝 Camp notes", es: "📝 Observaciones del campamento", fr: "📝 Notes du camp", de: "📝 Camp-Notizen" },
  "ex.: chega no sábado à tarde": { en: "e.g. arrives Saturday afternoon", es: "ej.: llega el sábado por la tarde", fr: "ex. : arrive samedi après-midi", de: "z. B. kommt Samstagnachmittag" },
  "Contato e saúde ficam no cadastro da pessoa no IPAlpha — quem cuida da equipe vê na página dela.": {
    en: "Contact and health stay in the person's IPAlpha profile — those who care for the team see them on the person's page.",
    es: "El contacto y la salud quedan en el registro de la persona en IPAlpha; quien cuida del equipo lo ve en su página.",
    fr: "Le contact et la santé restent dans la fiche IPAlpha de la personne — ceux qui prennent soin de l'équipe les voient sur sa page.",
    de: "Kontakt und Gesundheit bleiben im IPAlpha-Profil der Person — wer sich um das Team kümmert, sieht sie auf ihrer Seite.",
  },

  // ── picker ──
  "{n} ocupado": { en: "{n} busy", es: "{n} ocupado", fr: "{n} occupé", de: "{n} beschäftigt" },
  "{n} ocupados": { en: "{n} busy", es: "{n} ocupados", fr: "{n} occupés", de: "{n} beschäftigt" },

  // ── contacts / bus helpers ──
  "para o assunto. Os pais veem o nome e podem pedir o celular de cada pessoa.": {
    en: "for the topic. Parents see each person's name and can ask for their mobile.",
    es: "para el tema. Los padres ven el nombre y pueden pedir el celular de cada persona.",
    fr: "pour le sujet. Les parents voient le nom et peuvent demander le portable de chaque personne.",
    de: "für das Thema. Eltern sehen den Namen jeder Person und können die Handynummer abrufen.",
  },
  "O celular vem do cadastro da pessoa no IPAlpha. Quem entra nesta lista passa a ter acesso ao app fora da janela da equipe (como a organização).": {
    en: "The mobile comes from the person's IPAlpha profile. Whoever is on this list can use the app outside the team window (like the organization).",
    es: "El celular viene del registro de la persona en IPAlpha. Quien entra en esta lista tiene acceso a la app fuera de la ventana del equipo (como la organización).",
    fr: "Le portable vient de la fiche IPAlpha de la personne. Qui figure sur cette liste a accès à l'app hors de la fenêtre de l'équipe (comme l'organisation).",
    de: "Die Handynummer kommt aus dem IPAlpha-Profil der Person. Wer auf dieser Liste steht, kann die App auch außerhalb des Team-Zeitfensters nutzen (wie die Organisation).",
  },
  "Não está mais na equipe": { en: "No longer on the team", es: "Ya no está en el equipo", fr: "Ne fait plus partie de l'équipe", de: "Nicht mehr im Team" },
  "Ninguém na porta de nenhum veículo. Só a coordenação faz a chamada no ônibus.": {
    en: "Nobody at any vehicle's door. Only the coordination does the bus roll call.",
    es: "Nadie en la puerta de ningún vehículo. Solo la coordinación pasa lista en el autobús.",
    fr: "Personne à la porte d'aucun véhicule. Seule la coordination fait l'appel dans le bus.",
    de: "Niemand an der Tür eines Fahrzeugs. Nur die Koordination macht den Bus-Appell.",
  },

  // ── room distribution: ages not served yet ──
  "Por sexo": { en: "By sex", es: "Por sexo", fr: "Par sexe", de: "Nach Geschlecht" },
  "As idades virão do IPAlpha quando estiverem disponíveis.": {
    en: "Ages will come from IPAlpha when available.",
    es: "Las edades vendrán de IPAlpha cuando estén disponibles.",
    fr: "Les âges viendront d'IPAlpha quand ils seront disponibles.",
    de: "Das Alter kommt aus IPAlpha, sobald es verfügbar ist.",
  },
  "As idades ainda não vêm do IPAlpha: por enquanto a distribuição usa o sexo e as preferências de quarto. Quando estiverem disponíveis, dá para separar por idade aqui.": {
    en: "Ages don't come from IPAlpha yet: for now the distribution uses sex and room preferences. Once they're available, you can split by age here.",
    es: "Las edades aún no vienen de IPAlpha: por ahora la distribución usa el sexo y las preferencias de habitación. Cuando estén disponibles, podrás separar por edad aquí.",
    fr: "Les âges ne viennent pas encore d'IPAlpha : pour l'instant la répartition utilise le sexe et les préférences de chambre. Quand ils seront disponibles, vous pourrez séparer par âge ici.",
    de: "Das Alter kommt noch nicht aus IPAlpha: Vorerst nutzt die Verteilung Geschlecht und Zimmerwünsche. Sobald es verfügbar ist, kannst du hier nach Alter trennen.",
  },
};
