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
  "Não foi possível aplicar este filtro agora.": { en: "We couldn't apply this filter right now.", es: "No fue posible aplicar este filtro ahora.", fr: "Impossible d'appliquer ce filtre pour l'instant.", de: "Dieser Filter konnte gerade nicht angewendet werden." },
  // a 2nd responsável comes with a registration / import (decision 57)
  "Outro responsável por esta criança? Inclua o nome e o celular dele na planilha de importação (colunas do 2º responsável), ou peça a quem cuida do IPAlpha para ligá-lo.": {
    en: "Another guardian for this child? Add their name and mobile to the import spreadsheet (second guardian columns), or ask whoever looks after IPAlpha to link them.",
    es: "¿Otro responsable de este niño o niña? Incluye su nombre y celular en la planilla de importación (columnas del 2.º responsable), o pide a quien cuida IPAlpha que lo vincule.",
    fr: "Un autre responsable pour cet enfant ? Ajoutez son nom et son portable dans le tableau d'import (colonnes du 2e responsable), ou demandez à qui s'occupe d'IPAlpha de le relier.",
    de: "Eine weitere Bezugsperson für dieses Kind? Trag Name und Handynummer in die Importtabelle ein (Spalten der zweiten Bezugsperson) oder bitte die IPAlpha-Verantwortlichen, sie zu verbinden.",
  },
};
