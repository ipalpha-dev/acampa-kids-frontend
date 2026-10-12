import type { Locale } from "../locales";

/**
 * The camp authorization on the family's screen (decision 13) and its gentle refusals. Pastoral language: authorizing is
 * caring for the child; not authorizing is never a failure — the family can always talk to the coordenação.
 */
export const LITERALS: Record<string, Partial<Record<Exclude<Locale, "pt">, string>>> = {
  "Autorização do acampamento": {
    en: "Camp authorization",
    es: "Autorización del campamento",
    fr: "Autorisation du camp",
    de: "Einverständnis für das Camp",
  },
  "Para cuidarmos bem da sua criança no acampamento, leia com calma e autorize a participação.": {
    en: "So we can take good care of your child at camp, please read calmly and authorize their participation.",
    es: "Para cuidar bien de tu niño o niña en el campamento, lee con calma y autoriza su participación.",
    fr: "Pour que nous prenions bien soin de votre enfant au camp, lisez tranquillement et autorisez sa participation.",
    de: "Damit wir im Camp gut für dein Kind sorgen können, lies bitte in Ruhe und gib dein Einverständnis zur Teilnahme.",
  },
  "Texto da autorização": {
    en: "Authorization text",
    es: "Texto de la autorización",
    fr: "Texte de l'autorisation",
    de: "Text der Einverständniserklärung",
  },
  "O texto da autorização está em português, como foi publicado pela igreja.": {
    en: "The authorization text is in Portuguese, as the church published it.",
    es: "El texto de la autorización está en portugués, tal como lo publicó la iglesia.",
    fr: "Le texte de l'autorisation est en portugais, tel que l'église l'a publié.",
    de: "Der Text der Einverständniserklärung ist auf Portugiesisch, so wie die Gemeinde ihn veröffentlicht hat.",
  },
  "Aguardando sua autorização": {
    en: "Waiting for your authorization",
    es: "Esperando tu autorización",
    fr: "En attente de votre autorisation",
    de: "Wartet auf dein Einverständnis",
  },
  "Registrando…": {
    en: "Saving…",
    es: "Registrando…",
    fr: "Enregistrement…",
    de: "Wird gespeichert…",
  },
  "Li e autorizo a participação de {name}": {
    en: "I have read it and authorize {name} to take part",
    es: "Lo leí y autorizo la participación de {name}",
    fr: "J'ai lu et j'autorise la participation de {name}",
    de: "Ich habe es gelesen und bin einverstanden, dass {name} teilnimmt",
  },
  "Autorização aceita": {
    en: "Authorization given",
    es: "Autorización aceptada",
    fr: "Autorisation donnée",
    de: "Einverständnis gegeben",
  },
  "Obrigado! A autorização de {name} está registrada. Vamos cuidar com todo o carinho.": {
    en: "Thank you! {name}'s authorization is saved. We will take care with all our love.",
    es: "¡Gracias! La autorización de {name} quedó registrada. Vamos a cuidar con todo el cariño.",
    fr: "Merci ! L'autorisation pour {name} est enregistrée. Nous en prendrons soin avec toute notre affection.",
    de: "Danke! Das Einverständnis für {name} ist gespeichert. Wir kümmern uns mit ganzer Liebe.",
  },
  "O texto da autorização foi atualizado. Leia a nova versão, por favor.": {
    en: "The authorization text was updated. Please read the new version.",
    es: "El texto de la autorización se actualizó. Lee la nueva versión, por favor.",
    fr: "Le texte de l'autorisation a été mis à jour. Lisez la nouvelle version, s'il vous plaît.",
    de: "Der Text der Einverständniserklärung wurde aktualisiert. Bitte lies die neue Fassung.",
  },
  "Esta autorização não é mais pedida neste acampamento.": {
    en: "This authorization is no longer requested for this camp.",
    es: "Esta autorización ya no se pide en este campamento.",
    fr: "Cette autorisation n'est plus demandée pour ce camp.",
    de: "Dieses Einverständnis wird für dieses Camp nicht mehr erbeten.",
  },
  "Não foi possível registrar agora. Tente de novo daqui a pouco.": {
    en: "It could not be saved right now. Please try again in a little while.",
    es: "No se pudo registrar ahora. Inténtalo de nuevo en un rato.",
    fr: "L'enregistrement n'a pas été possible pour l'instant. Réessayez dans un moment.",
    de: "Das konnte gerade nicht gespeichert werden. Versuch es bitte gleich noch einmal.",
  },
  "Você pode conversar com a coordenação se tiver dúvidas.": {
    en: "You can talk to the camp coordination if you have any questions.",
    es: "Puedes conversar con la coordinación si tienes dudas.",
    fr: "Vous pouvez parler à la coordination si vous avez des questions.",
    de: "Wenn du Fragen hast, kannst du gern mit der Koordination sprechen.",
  },
  "A autorização do acampamento não pôde ser carregada agora. Tente de novo daqui a pouco.": {
    en: "The camp authorization could not be loaded right now. Please try again in a little while.",
    es: "La autorización del campamento no se pudo cargar ahora. Inténtalo de nuevo en un rato.",
    fr: "L'autorisation du camp n'a pas pu être chargée pour l'instant. Réessayez dans un moment.",
    de: "Das Einverständnis für das Camp konnte gerade nicht geladen werden. Versuch es bitte gleich noch einmal.",
  },
  "Por aqui você autoriza só pelas crianças sob seus cuidados neste acampamento.": {
    en: "Here you can authorize only for the children in your care at this camp.",
    es: "Aquí autorizas solo por los niños bajo tu cuidado en este campamento.",
    fr: "Ici, vous autorisez seulement pour les enfants dont vous prenez soin dans ce camp.",
    de: "Hier gibst du das Einverständnis nur für die Kinder, für die du in diesem Camp sorgst.",
  },
  "Confira o que foi mostrado e tente de novo.": {
    en: "Please check what was shown and try again.",
    es: "Revisa lo que se mostró e inténtalo de nuevo.",
    fr: "Vérifiez ce qui a été affiché et réessayez.",
    de: "Bitte prüf, was angezeigt wurde, und versuch es noch einmal.",
  },
  "Só os responsáveis pelas crianças podem fazer isso.": {
    en: "Only those who care for the children can do this.",
    es: "Solo los responsables de los niños pueden hacer esto.",
    fr: "Seuls les responsables des enfants peuvent faire cela.",
    de: "Das können nur die Verantwortlichen der Kinder.",
  },
  "As famílias aceitaram o documento {title} v{n} no formulário de inscrição": {
    en: "The families accepted the document {title} v{n} on the enrollment form",
    es: "Las familias aceptaron el documento {title} v{n} en el formulario de inscripción",
    fr: "Les familles ont accepté le document {title} v{n} dans le formulaire d'inscription",
    de: "Die Familien haben das Dokument {title} v{n} im Anmeldeformular angenommen",
  },
  "Ler o texto": {
    en: "Read the text",
    es: "Leer el texto",
    fr: "Lire le texte",
    de: "Text lesen",
  },
  "Fechar o texto": {
    en: "Close the text",
    es: "Cerrar el texto",
    fr: "Fermer le texte",
    de: "Text schließen",
  },
  "Marque só se o formulário de inscrição trazia esta autorização e as famílias aceitaram. Vale para todas as crianças desta planilha.": {
    en: "Tick it only if the enrollment form carried this authorization and the families accepted it. It applies to every child in this spreadsheet.",
    es: "Márcalo solo si el formulario de inscripción traía esta autorización y las familias la aceptaron. Vale para todos los niños de esta planilla.",
    fr: "Cochez seulement si le formulaire d'inscription contenait cette autorisation et que les familles l'ont acceptée. Cela vaut pour tous les enfants de ce tableau.",
    de: "Nur ankreuzen, wenn das Anmeldeformular dieses Einverständnis enthielt und die Familien es angenommen haben. Es gilt für alle Kinder dieser Tabelle.",
  },
  "Autorização pendente": {
    en: "Authorization pending",
    es: "Autorización pendiente",
    fr: "Autorisation en attente",
    de: "Einverständnis ausstehend",
  },
  "A família já autorizou a participação no acampamento.": {
    en: "The family has already authorized taking part in the camp.",
    es: "La familia ya autorizó la participación en el campamento.",
    fr: "La famille a déjà autorisé la participation au camp.",
    de: "Die Familie hat die Teilnahme am Camp schon erlaubt.",
  },
  "A família ainda não autorizou pelo app. Se precisar, converse com ela com carinho.": {
    en: "The family has not authorized in the app yet. If needed, talk with them kindly.",
    es: "La familia aún no autorizó en la app. Si hace falta, conversa con ella con cariño.",
    fr: "La famille n'a pas encore autorisé dans l'appli. Si besoin, parlez-lui avec bienveillance.",
    de: "Die Familie hat in der App noch nicht zugestimmt. Sprich bei Bedarf freundlich mit ihr.",
  },
};
