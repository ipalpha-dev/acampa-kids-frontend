import type { Locale } from "../locales";

/** Copy of the kids' screens after the people-in-IPAlpha rewrite (campers group). */
export const LITERALS: Record<string, Partial<Record<Exclude<Locale, "pt">, string>>> = {
  // ── family contact (read on tap) ──
  "Falar com a família de {name}": { en: "Talk to {name}'s family", es: "Hablar con la familia de {name}", fr: "Parler à la famille de {name}", de: "Mit der Familie von {name} sprechen" },
  "a criança": { en: "the child", es: "el niño", fr: "l'enfant", de: "das Kind" },
  "esta criança": { en: "this child", es: "este niño", fr: "cet enfant", de: "dieses Kind" },
  "Nenhum responsável visível.": { en: "No guardian you can see.", es: "Ningún responsable visible.", fr: "Aucun responsable visible.", de: "Keine sichtbare Bezugsperson." },
  "Nenhum responsável cadastrado ainda.": { en: "No guardian registered yet.", es: "Aún no hay ningún responsable registrado.", fr: "Aucun responsable enregistré pour l'instant.", de: "Noch keine Bezugsperson eingetragen." },

  // ── a second responsável (decision 38) ──
  "Mais alguém cuida de {name}?": { en: "Does someone else also care for {name}?", es: "¿Alguien más cuida de {name}?", fr: "Quelqu'un d'autre prend-il aussi soin de {name} ?", de: "Kümmert sich noch jemand um {name}?" },
  "Esta pessoa também fica como responsável pela mesma criança no IPAlpha e poderá acompanhá-la no Acampa.": {
    en: "This person also becomes a guardian of the same child in IPAlpha and can follow them in Acampa.",
    es: "Esta persona también queda como responsable del mismo niño en IPAlpha y podrá acompañarlo en Acampa.",
    fr: "Cette personne devient aussi responsable du même enfant dans IPAlpha et pourra le suivre dans Acampa.",
    de: "Diese Person wird in IPAlpha ebenfalls Bezugsperson desselben Kindes und kann es in Acampa begleiten.",
  },
  "Celular do responsável": { en: "Guardian's mobile", es: "Celular del responsable", fr: "Portable du responsable", de: "Handy der Bezugsperson" },
  "E-mail (opcional)": { en: "E-mail (optional)", es: "Correo (opcional)", fr: "E-mail (facultatif)", de: "E-Mail (optional)" },
  "Confira o e-mail.": { en: "Please check the e-mail.", es: "Revisa el correo.", fr: "Vérifiez l'e-mail.", de: "Bitte E-Mail prüfen." },

  // ── another responsável: a request the family accepts (decision 80) ──
  "Adicionar outro responsável": { en: "Add another guardian", es: "Agregar otro responsable", fr: "Ajouter un autre responsable", de: "Weitere Bezugsperson hinzufügen" },
  "Vamos pedir à família de {name}: quando um responsável aceitar, esta pessoa também passa a cuidar de {name} no IPAlpha e no Acampa Kids. Nada é compartilhado antes disso.": {
    en: "We'll ask {name}'s family: once a guardian accepts, this person also cares for {name} in IPAlpha and Acampa Kids. Nothing is shared before that.",
    es: "Le preguntaremos a la familia de {name}: cuando un responsable acepte, esta persona también cuidará de {name} en IPAlpha y en Acampa Kids. No se comparte nada antes.",
    fr: "Nous demanderons à la famille de {name} : quand un responsable acceptera, cette personne prendra aussi soin de {name} dans IPAlpha et Acampa Kids. Rien n'est partagé avant.",
    de: "Wir fragen die Familie von {name}: Sobald eine Bezugsperson zustimmt, kümmert sich diese Person in IPAlpha und Acampa Kids ebenfalls um {name}. Vorher wird nichts geteilt.",
  },
  "Enviar pedido": { en: "Send request", es: "Enviar solicitud", fr: "Envoyer la demande", de: "Anfrage senden" },
  "Pedido enviado": { en: "Request sent", es: "Solicitud enviada", fr: "Demande envoyée", de: "Anfrage gesendet" },
  "A família de {name} vai ver o pedido no Acampa Kids e no IPAlpha. Quando um responsável aceitar, {person} também passa a cuidar de {name} por aqui. O pedido vale por 30 dias.": {
    en: "{name}'s family will see the request in Acampa Kids and IPAlpha. Once a guardian accepts, {person} also cares for {name} here. The request is valid for 30 days.",
    es: "La familia de {name} verá la solicitud en Acampa Kids y en IPAlpha. Cuando un responsable acepte, {person} también cuidará de {name} aquí. La solicitud vale por 30 días.",
    fr: "La famille de {name} verra la demande dans Acampa Kids et IPAlpha. Quand un responsable acceptera, {person} prendra aussi soin de {name} ici. La demande est valable 30 jours.",
    de: "Die Familie von {name} sieht die Anfrage in Acampa Kids und IPAlpha. Sobald eine Bezugsperson zustimmt, kümmert sich {person} hier ebenfalls um {name}. Die Anfrage gilt 30 Tage.",
  },
  "Esta pessoa já é responsável por esta criança.": { en: "This person is already a guardian of this child.", es: "Esta persona ya es responsable de este niño.", fr: "Cette personne est déjà responsable de cet enfant.", de: "Diese Person ist bereits Bezugsperson dieses Kindes." },
  "Já existe um pedido para esta pessoa esperando a resposta da família.": {
    en: "There is already a request for this person waiting for the family's answer.",
    es: "Ya hay una solicitud para esta persona esperando la respuesta de la familia.",
    fr: "Une demande pour cette personne attend déjà la réponse de la famille.",
    de: "Für diese Person wartet schon eine Anfrage auf die Antwort der Familie.",
  },
  "Esta criança ainda não tem um responsável para aceitar o pedido. Fale com quem cuida do IPAlpha.": {
    en: "This child doesn't have a guardian yet who could accept the request. Talk to whoever looks after IPAlpha.",
    es: "Este niño aún no tiene un responsable que pueda aceptar la solicitud. Habla con quien cuida de IPAlpha.",
    fr: "Cet enfant n'a pas encore de responsable pour accepter la demande. Parlez à la personne qui s'occupe d'IPAlpha.",
    de: "Dieses Kind hat noch keine Bezugsperson, die die Anfrage annehmen könnte. Sprich mit der Person, die IPAlpha betreut.",
  },
  "Você não pode pedir para incluir a si mesmo.": { en: "You can't ask to include yourself.", es: "No puedes pedir incluirte a ti mismo.", fr: "Vous ne pouvez pas demander à vous inclure vous-même.", de: "Du kannst nicht darum bitten, dich selbst hinzuzufügen." },
  "O IPAlpha só liga responsáveis a crianças com data de nascimento e menores de 18 anos.": {
    en: "IPAlpha only connects guardians to children under 18 with a birth date.",
    es: "IPAlpha solo vincula responsables a niños menores de 18 años con fecha de nacimiento.",
    fr: "IPAlpha ne relie des responsables qu'aux enfants de moins de 18 ans ayant une date de naissance.",
    de: "IPAlpha verbindet Bezugspersonen nur mit Kindern unter 18 Jahren mit Geburtsdatum.",
  },
  "O período de inscrições desta edição está fechado no IPAlpha.": { en: "Sign-ups for this edition are closed in IPAlpha.", es: "Las inscripciones de esta edición están cerradas en IPAlpha.", fr: "Les inscriptions de cette édition sont fermées dans IPAlpha.", de: "Die Anmeldungen für diese Ausgabe sind in IPAlpha geschlossen." },
  "Só a coordenação pode pedir para incluir outro responsável.": { en: "Only the coordination can ask to include another guardian.", es: "Solo la coordinación puede pedir incluir otro responsable.", fr: "Seule la coordination peut demander d'ajouter un autre responsable.", de: "Nur die Koordination kann darum bitten, eine weitere Bezugsperson hinzuzufügen." },
  "O IPAlpha não criou este pedido agora. Tente de novo.": { en: "IPAlpha didn't create this request now. Try again.", es: "IPAlpha no creó esta solicitud ahora. Inténtalo de nuevo.", fr: "IPAlpha n'a pas créé cette demande pour le moment. Réessayez.", de: "IPAlpha hat diese Anfrage gerade nicht erstellt. Versuch es noch einmal." },
  "Informe o nome e o celular do responsável.": { en: "Enter the guardian's name and mobile.", es: "Indica el nombre y el celular del responsable.", fr: "Indiquez le nom et le portable du responsable.", de: "Gib Name und Handynummer der Bezugsperson an." },

  // ── the family decides (parent area) ──
  "{person} também cuida de {name}?": { en: "Does {person} also care for {name}?", es: "¿{person} también cuida de {name}?", fr: "{person} prend-il aussi soin de {name} ?", de: "Kümmert sich {person} auch um {name}?" },
  "A coordenação de {project} pediu para incluir {person} como outro responsável por {name}. Se você aceitar, {person} poderá acompanhar {name} no Acampa Kids e no IPAlpha, como você.": {
    en: "The {project} coordination asked to include {person} as another guardian of {name}. If you accept, {person} can follow {name} in Acampa Kids and IPAlpha, just like you.",
    es: "La coordinación de {project} pidió incluir a {person} como otro responsable de {name}. Si aceptas, {person} podrá acompañar a {name} en Acampa Kids y en IPAlpha, como tú.",
    fr: "La coordination de {project} a demandé d'ajouter {person} comme autre responsable de {name}. Si vous acceptez, {person} pourra suivre {name} dans Acampa Kids et IPAlpha, comme vous.",
    de: "Die Koordination von {project} hat gebeten, {person} als weitere Bezugsperson für {name} hinzuzufügen. Wenn du zustimmst, kann {person} {name} in Acampa Kids und IPAlpha begleiten, so wie du.",
  },
  "Pedido para a família": { en: "A request for the family", es: "Una solicitud para la familia", fr: "Une demande pour la famille", de: "Eine Anfrage an die Familie" },
  "Aceitar": { en: "Accept", es: "Aceptar", fr: "Accepter", de: "Annehmen" },
  "Recusar": { en: "Decline", es: "Rechazar", fr: "Refuser", de: "Ablehnen" },
  "Aceitando…": { en: "Accepting…", es: "Aceptando…", fr: "Acceptation…", de: "Wird angenommen…" },
  "Recusando…": { en: "Declining…", es: "Rechazando…", fr: "Refus…", de: "Wird abgelehnt…" },
  "Pronto! {person} agora também cuida de {name}.": { en: "Done! {person} now also cares for {name}.", es: "¡Listo! {person} ahora también cuida de {name}.", fr: "C'est fait ! {person} prend maintenant aussi soin de {name}.", de: "Fertig! {person} kümmert sich jetzt auch um {name}." },
  "Tudo bem, o pedido foi recusado. Nada foi compartilhado.": { en: "All right, the request was declined. Nothing was shared.", es: "Muy bien, la solicitud fue rechazada. No se compartió nada.", fr: "D'accord, la demande a été refusée. Rien n'a été partagé.", de: "Alles klar, die Anfrage wurde abgelehnt. Es wurde nichts geteilt." },
  "Este pedido já foi respondido ou não vale mais.": { en: "This request was already answered or is no longer valid.", es: "Esta solicitud ya fue respondida o ya no es válida.", fr: "Cette demande a déjà reçu une réponse ou n'est plus valable.", de: "Diese Anfrage wurde schon beantwortet oder ist nicht mehr gültig." },
  "Não foi possível responder agora. Tente de novo.": { en: "We couldn't answer now. Try again.", es: "No se pudo responder ahora. Inténtalo de nuevo.", fr: "Impossible de répondre pour le moment. Réessayez.", de: "Die Antwort hat gerade nicht geklappt. Versuch es noch einmal." },
  "outra pessoa": { en: "someone else", es: "otra persona", fr: "une autre personne", de: "eine weitere Person" },

  // ── health edit + history ──
  "Fica guardado no IPAlpha, com o cuidado que essas informações pedem. O histórico registra só quais campos mudaram, quem e quando.": {
    en: "It is kept in IPAlpha, with the care this information deserves. The history records only which fields changed, who and when.",
    es: "Se guarda en IPAlpha, con el cuidado que esta información merece. El historial registra solo qué campos cambiaron, quién y cuándo.",
    fr: "C'est conservé dans IPAlpha, avec le soin que ces informations méritent. L'historique n'enregistre que les champs modifiés, par qui et quand.",
    de: "Es wird in IPAlpha aufbewahrt, mit der Sorgfalt, die diese Angaben verdienen. Der Verlauf hält nur fest, welche Felder sich geändert haben, wer und wann.",
  },
  "🕓 Alterações · {name}": { en: "🕓 Changes · {name}", es: "🕓 Cambios · {name}", fr: "🕓 Modifications · {name}", de: "🕓 Änderungen · {name}" },
  "Mostra quais campos mudaram, quem mudou e quando. Os dados ficam guardados no IPAlpha.": {
    en: "Shows which fields changed, who changed them and when. The data itself stays in IPAlpha.",
    es: "Muestra qué campos cambiaron, quién los cambió y cuándo. Los datos quedan guardados en IPAlpha.",
    fr: "Montre les champs modifiés, par qui et quand. Les données restent dans IPAlpha.",
    de: "Zeigt, welche Felder sich geändert haben, wer sie geändert hat und wann. Die Daten bleiben in IPAlpha.",
  },
  "Nada foi alterado ainda.": { en: "Nothing has been changed yet.", es: "Todavía no se cambió nada.", fr: "Rien n'a encore été modifié.", de: "Bisher wurde nichts geändert." },
  "🩺 saúde": { en: "🩺 health", es: "🩺 salud", fr: "🩺 santé", de: "🩺 Gesundheit" },
  "Campos alterados": { en: "Changed fields", es: "Campos modificados", fr: "Champs modifiés", de: "Geänderte Felder" },

  // ── adding a kid: two paths ──
  "Como adicionar a criança": { en: "How to add the child", es: "Cómo agregar al niño", fr: "Comment ajouter l'enfant", de: "Wie das Kind hinzufügen" },
  "A criança já tem cadastro na igreja": { en: "The child is already registered at church", es: "El niño ya está registrado en la iglesia", fr: "L'enfant est déjà inscrit à l'église", de: "Das Kind ist in der Gemeinde schon erfasst" },
  "Cadastrar criança nova": { en: "Register a new child", es: "Registrar un niño nuevo", fr: "Inscrire un nouvel enfant", de: "Neues Kind erfassen" },
  "Cadastramos a criança e o responsável no IPAlpha": { en: "We register the child and the guardian in IPAlpha", es: "Registramos al niño y al responsable en IPAlpha", fr: "Nous inscrivons l'enfant et le responsable dans IPAlpha", de: "Wir erfassen das Kind und die Bezugsperson in IPAlpha" },
  "Aqui ficam só os dados do acampamento. Nome e família vêm do IPAlpha; a saúde é editada na página da criança.": {
    en: "Only the camp details live here. Name and family come from IPAlpha; health is edited on the child's page.",
    es: "Aquí quedan solo los datos del campamento. El nombre y la familia vienen de IPAlpha; la salud se edita en la página del niño.",
    fr: "Ici, seulement les informations du camp. Le nom et la famille viennent d'IPAlpha ; la santé se modifie sur la page de l'enfant.",
    de: "Hier stehen nur die Camp-Angaben. Name und Familie kommen aus IPAlpha; die Gesundheit wird auf der Seite des Kindes bearbeitet.",
  },
  "🔎 Encontrar a criança": { en: "🔎 Find the child", es: "🔎 Encontrar al niño", fr: "🔎 Trouver l'enfant", de: "🔎 Kind finden" },
  "Buscar no IPAlpha": { en: "Search IPAlpha", es: "Buscar en IPAlpha", fr: "Rechercher dans IPAlpha", de: "In IPAlpha suchen" },
  "Ninguém com esse nome entre as crianças do IPAlpha. Que tal cadastrar como criança nova?": {
    en: "No one with that name among IPAlpha's children. How about registering a new child?",
    es: "Nadie con ese nombre entre los niños de IPAlpha. ¿Qué tal registrarlo como niño nuevo?",
    fr: "Personne de ce nom parmi les enfants d'IPAlpha. Et si vous l'inscriviez comme nouvel enfant ?",
    de: "Niemand mit diesem Namen unter den Kindern in IPAlpha. Wie wäre es, ein neues Kind zu erfassen?",
  },
  "Crianças encontradas": { en: "Children found", es: "Niños encontrados", fr: "Enfants trouvés", de: "Gefundene Kinder" },
  "Já está no acampamento": { en: "Already at camp", es: "Ya está en el campamento", fr: "Déjà au camp", de: "Schon im Camp" },
  "Há mais resultados — digite mais do nome para encontrar.": { en: "There are more results — type more of the name to find them.", es: "Hay más resultados: escribe más del nombre para encontrarlo.", fr: "Il y a d'autres résultats — tapez davantage du nom pour trouver.", de: "Es gibt weitere Treffer — tippe mehr vom Namen, um zu finden." },
  "🌱 A criança": { en: "🌱 The child", es: "🌱 El niño", fr: "🌱 L'enfant", de: "🌱 Das Kind" },
  "Responsável pela criança": { en: "Who cares for the child", es: "Responsable del niño", fr: "Responsable de l'enfant", de: "Bezugsperson des Kindes" },
  "Outro responsável pode ser adicionado depois, na página da criança.": { en: "Another guardian can be added later, on the child's page.", es: "Otro responsable se puede agregar después, en la página del niño.", fr: "Un autre responsable peut être ajouté plus tard, sur la page de l'enfant.", de: "Eine weitere Bezugsperson kann später auf der Seite des Kindes hinzugefügt werden." },
  "🩺 Informar a saúde agora": { en: "🩺 Add health information now", es: "🩺 Informar la salud ahora", fr: "🩺 Indiquer la santé maintenant", de: "🩺 Gesundheit jetzt angeben" },
  "Fica no IPAlpha e só a coordenação e a equipe de cuidado veem.": { en: "It stays in IPAlpha and only the coordination and the care team see it.", es: "Queda en IPAlpha y solo la coordinación y el equipo de cuidado lo ven.", fr: "C'est conservé dans IPAlpha et seuls la coordination et l'équipe de soin le voient.", de: "Bleibt in IPAlpha; nur die Koordination und das Fürsorge-Team sehen es." },
  "📝 Observações": { en: "📝 Notes", es: "📝 Observaciones", fr: "📝 Remarques", de: "📝 Notizen" },
  "ex.: cole aqui o texto da inscrição — saúde, responsável e preferências vão para os campos certos": {
    en: "e.g. paste the registration text here — health, guardian and preferences go to the right fields",
    es: "ej.: pega aquí el texto de la inscripción: salud, responsable y preferencias van a los campos correctos",
    fr: "ex. : collez ici le texte de l'inscription — santé, responsable et préférences vont dans les bons champs",
    de: "z. B. hier den Anmeldetext einfügen — Gesundheit, Bezugsperson und Wünsche landen in den richtigen Feldern",
  },

  // ── list: leaving the camp, export, filter ──
  "Tirar {name} do acampamento?": { en: "Take {name} off this camp?", es: "¿Quitar a {name} del campamento?", fr: "Retirer {name} de ce camp ?", de: "{name} aus diesem Camp nehmen?" },
  "Tirar {name} do acampamento": { en: "Take {name} off this camp", es: "Quitar a {name} del campamento", fr: "Retirer {name} de ce camp", de: "{name} aus diesem Camp nehmen" },
  "A criança deixa de aparecer neste acampamento. O cadastro dela e da família no IPAlpha continua.": {
    en: "The child no longer appears in this camp. Their and their family's record in IPAlpha stays.",
    es: "El niño deja de aparecer en este campamento. Su registro y el de su familia en IPAlpha siguen.",
    fr: "L'enfant n'apparaît plus dans ce camp. Sa fiche et celle de sa famille dans IPAlpha restent.",
    de: "Das Kind erscheint nicht mehr in diesem Camp. Sein Eintrag und der seiner Familie in IPAlpha bleiben.",
  },
  "Tirar do acampamento": { en: "Take off this camp", es: "Quitar del campamento", fr: "Retirer du camp", de: "Aus dem Camp nehmen" },
  "{name} não está mais neste acampamento.": { en: "{name} is no longer in this camp.", es: "{name} ya no está en este campamento.", fr: "{name} n'est plus dans ce camp.", de: "{name} ist nicht mehr in diesem Camp." },
  "Não foi possível preparar a planilha agora.": { en: "We couldn't prepare the spreadsheet right now.", es: "No fue posible preparar la planilla ahora.", fr: "Impossible de préparer le tableau pour l'instant.", de: "Die Tabelle konnte gerade nicht vorbereitet werden." },
  "Preparando a planilha… {done} de {total}": { en: "Preparing the spreadsheet… {done} of {total}", es: "Preparando la planilla… {done} de {total}", fr: "Préparation du tableau… {done} sur {total}", de: "Tabelle wird vorbereitet … {done} von {total}" },
  "Preparando a planilha com os dados de agora…": { en: "Preparing the spreadsheet with the current data…", es: "Preparando la planilla con los datos actuales…", fr: "Préparation du tableau avec les données actuelles…", de: "Tabelle wird mit den aktuellen Daten vorbereitet …" },
  "Os responsáveis desta criança não aparecem para o seu perfil. A coordenação pode ajudar.": {
    en: "This child's guardians aren't shown for your profile. The coordination team can help.",
    es: "Los responsables de este niño no aparecen para tu perfil. La coordinación puede ayudar.",
    fr: "Les responsables de cet enfant ne s'affichent pas pour votre profil. La coordination peut aider.",
    de: "Die Bezugspersonen dieses Kindes werden für dein Profil nicht angezeigt. Die Koordination kann helfen.",
  },
  "Não foi possível aplicar este filtro agora.": { en: "We couldn't apply this filter right now.", es: "No fue posible aplicar este filtro ahora.", fr: "Impossible d'appliquer ce filtre pour l'instant.", de: "Dieser Filter konnte gerade nicht angewendet werden." },
};
