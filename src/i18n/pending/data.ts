import type { Locale } from "../locales";

/** Copy of the data screens (exports, imports, backup, settings / super / cleanup / wizard) — people-in-IPAlpha rewrite. */
export const LITERALS: Record<string, Partial<Record<Exclude<Locale, "pt">, string>>> = {
  // ── names ──
  "Nome indisponível no momento": { en: "Name not available right now", es: "Nombre no disponible por ahora", fr: "Nom indisponible pour le moment", de: "Name gerade nicht verfügbar" },
  "Carregando nome…": { en: "Loading name…", es: "Cargando nombre…", fr: "Chargement du nom…", de: "Name wird geladen…" },

  // ── spreadsheet exports ──
  "{name} (próprio celular)": { en: "{name} (own phone)", es: "{name} (su propio celular)", fr: "{name} (son propre téléphone)", de: "{name} (eigenes Handy)" },
  "Peso (kg)": { en: "Weight (kg)", es: "Peso (kg)", fr: "Poids (kg)", de: "Gewicht (kg)" },
  "Medicamentos": { en: "Medicines", es: "Medicamentos", fr: "Médicaments", de: "Medikamente" },
  "Restrições alimentares": { en: "Food restrictions", es: "Restricciones alimentarias", fr: "Restrictions alimentaires", de: "Ernährungseinschränkungen" },
  "Carteirinha do convênio": { en: "Health plan card", es: "Tarjeta del seguro médico", fr: "Carte de mutuelle", de: "Versichertenkarte" },
  "Apelido": { en: "Nickname", es: "Apodo", fr: "Surnom", de: "Spitzname" },
  "Líder do quarto": { en: "Room leader", es: "Líder de la habitación", fr: "Responsable de la chambre", de: "Zimmerleitung" },
  "Observações gerais": { en: "General notes", es: "Observaciones generales", fr: "Remarques générales", de: "Allgemeine Hinweise" },
  "Celular do responsável": { en: "Guardian's phone", es: "Celular del responsable", fr: "Téléphone du responsable", de: "Handy der Bezugsperson" },
  "QR token": { en: "QR token", es: "Token QR", fr: "Jeton QR", de: "QR-Token" },
  "Check-in em": { en: "Check-in at", es: "Check-in el", fr: "Accueil le", de: "Check-in am" },
  "Check-in por": { en: "Check-in by", es: "Check-in por", fr: "Accueil par", de: "Check-in durch" },
  "Check-in ônibus ida": { en: "Bus check-in (going)", es: "Check-in autobús ida", fr: "Embarquement aller", de: "Bus-Check-in Hinfahrt" },
  "Check-in ônibus ida em": { en: "Bus check-in (going) at", es: "Check-in autobús ida el", fr: "Embarquement aller le", de: "Bus-Check-in Hinfahrt am" },
  "Check-in ônibus ida por": { en: "Bus check-in (going) by", es: "Check-in autobús ida por", fr: "Embarquement aller par", de: "Bus-Check-in Hinfahrt durch" },
  "Check-in ônibus volta": { en: "Bus check-in (return)", es: "Check-in autobús vuelta", fr: "Embarquement retour", de: "Bus-Check-in Rückfahrt" },
  "Check-in ônibus volta em": { en: "Bus check-in (return) at", es: "Check-in autobús vuelta el", fr: "Embarquement retour le", de: "Bus-Check-in Rückfahrt am" },
  "Check-in ônibus volta por": { en: "Bus check-in (return) by", es: "Check-in autobús vuelta por", fr: "Embarquement retour par", de: "Bus-Check-in Rückfahrt durch" },
  "Foi para o acampamento": { en: "Went to camp", es: "Fue al campamento", fr: "Est allé au camp", de: "Ist mitgefahren" },
  "Colete entregue": { en: "Vest handed out", es: "Chaleco entregado", fr: "Gilet remis", de: "Weste ausgegeben" },
  "Colete entregue em": { en: "Vest handed out at", es: "Chaleco entregado el", fr: "Gilet remis le", de: "Weste ausgegeben am" },
  "Colete entregue por": { en: "Vest handed out by", es: "Chaleco entregado por", fr: "Gilet remis par", de: "Weste ausgegeben von" },
  "Colete devolvido": { en: "Vest returned", es: "Chaleco devuelto", fr: "Gilet rendu", de: "Weste zurückgegeben" },
  "Colete devolvido em": { en: "Vest returned at", es: "Chaleco devuelto el", fr: "Gilet rendu le", de: "Weste zurückgegeben am" },
  "Colete devolvido por": { en: "Vest returned to", es: "Chaleco devuelto a", fr: "Gilet rendu à", de: "Weste zurückgenommen von" },
  "Leituras fora do escopo": { en: "Out-of-scope scans", es: "Lecturas fuera del alcance", fr: "Lectures hors périmètre", de: "Scans außerhalb des Bereichs" },
  "Crianças lidas fora do escopo": { en: "Children scanned out of scope", es: "Niños leídos fuera del alcance", fr: "Enfants lus hors périmètre", de: "Außerhalb des Bereichs gescannte Kinder" },
  "Ocupadas": { en: "Taken", es: "Ocupadas", fr: "Occupés", de: "Belegt" },
  "Livres": { en: "Free", es: "Libres", fr: "Libres", de: "Frei" },
  "Quem cuida do quarto": { en: "Who looks after the room", es: "Quién cuida la habitación", fr: "Qui s'occupe de la chambre", de: "Wer sich um das Zimmer kümmert" },
  "Resumo": { en: "Summary", es: "Resumen", fr: "Résumé", de: "Übersicht" },

  // ── Sobre: backup ──
  "Só cópias no formato v{n} podem ser restauradas. Elas guardam apenas a operação do acampamento — nunca sessões nem dados pessoais, que ficam no IPAlpha.": {
    en: "Only backups in format v{n} can be restored. They keep only the camp's operations — never sessions or personal data, which stay in IPAlpha.",
    es: "Solo se pueden restaurar copias en formato v{n}. Guardan solo la operación del campamento — nunca sesiones ni datos personales, que quedan en IPAlpha.",
    fr: "Seules les sauvegardes au format v{n} peuvent être restaurées. Elles ne gardent que le fonctionnement du camp — jamais les sessions ni les données personnelles, qui restent dans IPAlpha.",
    de: "Nur Sicherungen im Format v{n} lassen sich wiederherstellen. Sie enthalten nur den Campbetrieb — nie Sitzungen oder persönliche Daten, die in IPAlpha bleiben.",
  },

  // ── imports ──
  "Só quem serve na coordenação pode gravar a importação no IPAlpha. Troque para o perfil de coordenação e tente de novo — nada foi perdido.": {
    en: "Only those serving in coordination can save the import to IPAlpha. Switch to the coordination profile and try again — nothing was lost.",
    es: "Solo quien sirve en la coordinación puede guardar la importación en IPAlpha. Cambia al perfil de coordinación e inténtalo de nuevo — no se perdió nada.",
    fr: "Seules les personnes qui servent à la coordination peuvent enregistrer l'import dans IPAlpha. Passez au profil coordination et réessayez — rien n'a été perdu.",
    de: "Nur wer in der Koordination dient, kann den Import in IPAlpha speichern. Wechsle zum Koordinationsprofil und versuch es noch einmal — nichts ist verloren.",
  },
  "As crianças já estão no sistema. A revisão das observações por IA continua em segundo plano e grava as informações de saúde direto no IPAlpha.": {
    en: "The children are already in the system. The AI review of the notes continues in the background and saves the health information straight to IPAlpha.",
    es: "Los niños ya están en el sistema. La revisión de las observaciones por IA sigue en segundo plano y guarda la información de salud directamente en IPAlpha.",
    fr: "Les enfants sont déjà dans le système. La relecture des remarques par l'IA continue en arrière-plan et enregistre les informations de santé directement dans IPAlpha.",
    de: "Die Kinder sind schon im System. Die KI-Prüfung der Hinweise läuft im Hintergrund weiter und speichert die Gesundheitsangaben direkt in IPAlpha.",
  },
  "A sua entrada no IPAlpha terminou enquanto a IA organizava as informações de saúde. Nada se perdeu: entre de novo e continue a importação em Configurações.": {
    en: "Your IPAlpha sign-in ended while the AI was organizing the health information. Nothing was lost: sign in again and continue the import in Settings.",
    es: "Tu acceso a IPAlpha terminó mientras la IA organizaba la información de salud. No se perdió nada: entra de nuevo y continúa la importación en Configuración.",
    fr: "Votre connexion à IPAlpha s'est terminée pendant que l'IA organisait les informations de santé. Rien n'est perdu : reconnectez-vous et continuez l'import dans Paramètres.",
    de: "Deine IPAlpha-Anmeldung ist abgelaufen, während die KI die Gesundheitsangaben geordnet hat. Nichts ist verloren: Melde dich neu an und setze den Import in den Einstellungen fort.",
  },
  "{inserted} inseridos, {updated} atualizados e {created} pessoa(s) nova(s) no IPAlpha.": {
    en: "{inserted} added, {updated} updated and {created} new person(s) in IPAlpha.",
    es: "{inserted} añadidos, {updated} actualizados y {created} persona(s) nueva(s) en IPAlpha.",
    fr: "{inserted} ajoutés, {updated} mis à jour et {created} nouvelle(s) personne(s) dans IPAlpha.",
    de: "{inserted} hinzugefügt, {updated} aktualisiert und {created} neue Person(en) in IPAlpha.",
  },
  "{n} pessoa(s) ficaram de fora desta vez (por exemplo, sem celular). Dá para cadastrá-las no IPAlpha e importar de novo.": {
    en: "{n} person(s) were left out this time (for example, no phone). You can register them in IPAlpha and import again.",
    es: "{n} persona(s) quedaron fuera esta vez (por ejemplo, sin celular). Puedes registrarlas en IPAlpha e importar de nuevo.",
    fr: "{n} personne(s) n'ont pas été incluses cette fois (par exemple, sans téléphone). Vous pouvez les enregistrer dans IPAlpha et importer à nouveau.",
    de: "{n} Person(en) waren diesmal nicht dabei (zum Beispiel ohne Handynummer). Du kannst sie in IPAlpha erfassen und noch einmal importieren.",
  },
  "Corrija ou ignore as dúvidas. O quarto pode ficar vazio; sem celular, a pessoa fica de fora desta importação.": {
    en: "Fix or skip the questions. The room may stay empty; without a phone, the person is left out of this import.",
    es: "Corrige u omite las dudas. La habitación puede quedar vacía; sin celular, la persona queda fuera de esta importación.",
    fr: "Corrigez ou ignorez les questions. La chambre peut rester vide ; sans téléphone, la personne n'est pas incluse dans cet import.",
    de: "Korrigiere oder überspringe die Fragen. Das Zimmer darf leer bleiben; ohne Handynummer ist die Person bei diesem Import nicht dabei.",
  },
  "Mesma pessoa: {name}": { en: "Same person: {name}", es: "Misma persona: {name}", fr: "Même personne : {name}", de: "Dieselbe Person: {name}" },
  "Quem ficar sem celular não entra nesta importação: dá para cadastrar a pessoa no IPAlpha e importar de novo.": {
    en: "Anyone left without a phone is not part of this import: you can register the person in IPAlpha and import again.",
    es: "Quien quede sin celular no entra en esta importación: puedes registrar a la persona en IPAlpha e importar de nuevo.",
    fr: "Les personnes sans téléphone ne font pas partie de cet import : vous pouvez les enregistrer dans IPAlpha et importer à nouveau.",
    de: "Wer ohne Handynummer bleibt, ist bei diesem Import nicht dabei: Du kannst die Person in IPAlpha erfassen und noch einmal importieren.",
  },
  "✅ {n} importado(s). {m} ainda precisa(m) ser incluído(s) nesta edição pelo Mordomia — com calma, ninguém se perdeu.": {
    en: "✅ {n} imported. {m} still need(s) to be added to this edition in Mordomia — no rush, nobody got lost.",
    es: "✅ {n} importado(s). {m} aún necesita(n) ser incluido(s) en esta edición desde Mordomia — con calma, nadie se perdió.",
    fr: "✅ {n} importé(s). {m} doi(ven)t encore être ajouté(s) à cette édition dans Mordomia — sans hâte, personne n'est perdu.",
    de: "✅ {n} importiert. {m} muss/müssen noch in Mordomia zu dieser Ausgabe hinzugefügt werden — in Ruhe, niemand ist verloren.",
  },

  // ── Geral: import health card ──
  "Informações de saúde da importação": { en: "Health information from imports", es: "Información de salud de la importación", fr: "Informations de santé de l'import", de: "Gesundheitsangaben aus dem Import" },
  "Depois de aplicar uma planilha, a IA organiza as informações de saúde e grava direto no IPAlpha com o seu acesso — nada fica guardado no acampamento.": {
    en: "After a spreadsheet is applied, the AI organizes the health information and saves it straight to IPAlpha with your sign-in — nothing is kept in the camp app.",
    es: "Después de aplicar una planilla, la IA organiza la información de salud y la guarda directamente en IPAlpha con tu acceso — nada queda guardado en el campamento.",
    fr: "Après l'application d'un tableur, l'IA organise les informations de santé et les enregistre directement dans IPAlpha avec votre connexion — rien n'est conservé dans le camp.",
    de: "Nach dem Übernehmen einer Tabelle ordnet die KI die Gesundheitsangaben und speichert sie mit deiner Anmeldung direkt in IPAlpha — im Camp wird nichts aufbewahrt.",
  },
  "Nenhuma importação esperando por você. 💚": { en: "No import is waiting for you. 💚", es: "Ninguna importación te está esperando. 💚", fr: "Aucun import ne vous attend. 💚", de: "Kein Import wartet auf dich. 💚" },
  "1 importação está esperando você. O seu acesso ao IPAlpha terminou enquanto a IA trabalhava — nada se perdeu.": {
    en: "1 import is waiting for you. Your IPAlpha sign-in ended while the AI was working — nothing was lost.",
    es: "1 importación te está esperando. Tu acceso a IPAlpha terminó mientras la IA trabajaba — no se perdió nada.",
    fr: "1 import vous attend. Votre connexion à IPAlpha s'est terminée pendant que l'IA travaillait — rien n'est perdu.",
    de: "1 Import wartet auf dich. Deine IPAlpha-Anmeldung ist abgelaufen, während die KI gearbeitet hat — nichts ist verloren.",
  },
  "{n} importações estão esperando você. O seu acesso ao IPAlpha terminou enquanto a IA trabalhava — nada se perdeu.": {
    en: "{n} imports are waiting for you. Your IPAlpha sign-in ended while the AI was working — nothing was lost.",
    es: "{n} importaciones te están esperando. Tu acceso a IPAlpha terminó mientras la IA trabajaba — no se perdió nada.",
    fr: "{n} imports vous attendent. Votre connexion à IPAlpha s'est terminée pendant que l'IA travaillait — rien n'est perdu.",
    de: "{n} Importe warten auf dich. Deine IPAlpha-Anmeldung ist abgelaufen, während die KI gearbeitet hat — nichts ist verloren.",
  },
  "pausada {when}": { en: "paused {when}", es: "en pausa {when}", fr: "en pause {when}", de: "pausiert {when}" },
  "Gravando…": { en: "Saving…", es: "Guardando…", fr: "Enregistrement…", de: "Wird gespeichert…" },
  "Gravar no IPAlpha": { en: "Save to IPAlpha", es: "Guardar en IPAlpha", fr: "Enregistrer dans IPAlpha", de: "In IPAlpha speichern" },
  "Se você acabou de entrar de novo, é só tocar em Gravar no IPAlpha. Só quem começou a importação pode continuar.": {
    en: "If you have just signed in again, just tap Save to IPAlpha. Only the person who started the import can continue it.",
    es: "Si acabas de entrar de nuevo, solo toca Guardar en IPAlpha. Solo quien empezó la importación puede continuarla.",
    fr: "Si vous venez de vous reconnecter, touchez simplement Enregistrer dans IPAlpha. Seule la personne qui a commencé l'import peut le poursuivre.",
    de: "Wenn du dich gerade neu angemeldet hast, tippe einfach auf In IPAlpha speichern. Nur wer den Import gestartet hat, kann ihn fortsetzen.",
  },
  "Pronto! A IA continua gravando as informações de saúde de {file} no IPAlpha.": {
    en: "Done! The AI keeps saving the health information from {file} to IPAlpha.",
    es: "¡Listo! La IA sigue guardando la información de salud de {file} en IPAlpha.",
    fr: "C'est fait ! L'IA continue d'enregistrer les informations de santé de {file} dans IPAlpha.",
    de: "Fertig! Die KI speichert die Gesundheitsangaben aus {file} weiter in IPAlpha.",
  },
  "Não foi possível continuar agora. Tente de novo em instantes.": {
    en: "Couldn't continue right now. Try again in a moment.",
    es: "No fue posible continuar ahora. Inténtalo de nuevo en unos instantes.",
    fr: "Impossible de continuer pour le moment. Réessayez dans un instant.",
    de: "Das Fortsetzen hat gerade nicht geklappt. Versuch es gleich noch einmal.",
  },
  "A partir de 3 a coordenação recebe um SMS; a partir de 5 o acesso a crianças de fora fica bloqueado até zerar.": {
    en: "From 3 on, the coordination gets an SMS; from 5 on, access to children from other rooms is blocked until reset.",
    es: "A partir de 3 la coordinación recibe un SMS; a partir de 5 el acceso a niños de otras habitaciones queda bloqueado hasta reiniciar.",
    fr: "À partir de 3, la coordination reçoit un SMS ; à partir de 5, l'accès aux enfants d'autres chambres est bloqué jusqu'à la remise à zéro.",
    de: "Ab 3 bekommt die Koordination eine SMS; ab 5 ist der Zugriff auf Kinder aus anderen Zimmern bis zum Zurücksetzen gesperrt.",
  },

  // ── Notificações ──
  "Boas-vindas da equipe": { en: "Team welcome", es: "Bienvenida del equipo", fr: "Bienvenue de l'équipe", de: "Willkommen fürs Team" },
  "Quando o app é liberado para a equipe (início do período de acesso) cada pessoa recebe, uma única vez, um SMS de boas-vindas com o link do app. Os papéis de cada pessoa (organização, saúde, check-in…) são definidos no IPAlpha.": {
    en: "When the app opens for the team (start of the access period) each person gets, only once, a welcome SMS with the app link. Each person's roles (organization, health, check-in…) are set in IPAlpha.",
    es: "Cuando la app se abre para el equipo (inicio del período de acceso) cada persona recibe, una sola vez, un SMS de bienvenida con el enlace de la app. Los roles de cada persona (organización, salud, check-in…) se definen en IPAlpha.",
    fr: "Quand l'app s'ouvre pour l'équipe (début de la période d'accès), chaque personne reçoit, une seule fois, un SMS de bienvenue avec le lien de l'app. Les rôles de chacun (organisation, santé, accueil…) sont définis dans IPAlpha.",
    de: "Wenn die App für das Team freigegeben wird (Beginn des Zugangszeitraums), bekommt jede Person einmalig eine Willkommens-SMS mit dem App-Link. Die Aufgaben jeder Person (Organisation, Gesundheit, Check-in…) werden in IPAlpha festgelegt.",
  },
  "A família alterou os pontos de atenção": { en: "The family updated the points of attention", es: "La familia cambió los puntos de atención", fr: "La famille a modifié les points d'attention", de: "Die Familie hat die Hinweise geändert" },
  "Quando um responsável altera as informações de saúde da criança (alergias, medicação, convênio…), a equipe de cuidado, a coordenação e o líder do quarto recebem um SMS. Se mudar só as observações, apenas o líder do quarto é avisado.": {
    en: "When a guardian changes the child's health information (allergies, medication, health plan…), the care team, the coordination and the room leader get an SMS. If only the notes change, only the room leader is told.",
    es: "Cuando un responsable cambia la información de salud del niño (alergias, medicación, seguro…), el equipo de cuidado, la coordinación y el líder de la habitación reciben un SMS. Si solo cambian las observaciones, solo se avisa al líder de la habitación.",
    fr: "Quand un responsable modifie les informations de santé de l'enfant (allergies, médicaments, mutuelle…), l'équipe de soin, la coordination et le responsable de la chambre reçoivent un SMS. Si seules les remarques changent, seul le responsable de la chambre est prévenu.",
    de: "Wenn eine Bezugsperson die Gesundheitsangaben des Kindes ändert (Allergien, Medikamente, Versicherung…), bekommen das Fürsorge-Team, die Koordination und die Zimmerleitung eine SMS. Ändern sich nur die Hinweise, wird nur die Zimmerleitung benachrichtigt.",
  },
  "Quando uma ocorrência é registrada (pela organização ou pela equipe de cuidado), a coordenação recebe um SMS — a não ser que tenha sido quem registrou.": {
    en: "When an occurrence is recorded (by the organization or the care team), the coordination gets an SMS — unless they recorded it themselves.",
    es: "Cuando se registra una ocurrencia (por la organización o el equipo de cuidado), la coordinación recibe un SMS — a menos que haya sido quien la registró.",
    fr: "Quand un incident est enregistré (par l'organisation ou l'équipe de soin), la coordination reçoit un SMS — sauf si c'est elle qui l'a enregistré.",
    de: "Wenn ein Vorfall erfasst wird (von der Organisation oder dem Fürsorge-Team), bekommt die Koordination eine SMS — außer sie hat ihn selbst erfasst.",
  },
  "Quando quem serve na fotografia liga": { en: "When whoever serves in photography turns on", es: "Cuando quien sirve en la fotografía activa", fr: "Quand la personne qui sert à la photographie active", de: "Wenn, wer in der Fotografie dient, Folgendes einschaltet:" },

  // ── Superusuário ──
  "Isso apaga para sempre o que o acampamento guarda de {label}: a participação de {campers} acampante(s) e {staff} pessoa(s) da equipe (quartos, times, check-ins) e {photos} foto(s). Os cadastros das pessoas continuam no IPAlpha. Não pode ser desfeito.": {
    en: "This permanently deletes what the camp app keeps for {label}: the participation of {campers} camper(s) and {staff} team member(s) (rooms, teams, check-ins) and {photos} photo(s). The people's records stay in IPAlpha. It cannot be undone.",
    es: "Esto borra para siempre lo que el campamento guarda de {label}: la participación de {campers} campista(s) y {staff} persona(s) del equipo (habitaciones, equipos, check-ins) y {photos} foto(s). Los registros de las personas siguen en IPAlpha. No se puede deshacer.",
    fr: "Cela supprime définitivement ce que le camp garde de {label} : la participation de {campers} campeur(s) et {staff} membre(s) de l'équipe (chambres, équipes, accueils) et {photos} photo(s). Les fiches des personnes restent dans IPAlpha. C'est irréversible.",
    de: "Das löscht endgültig, was das Camp zu {label} speichert: die Teilnahme von {campers} Kind(ern) und {staff} Teammitglied(ern) (Zimmer, Teams, Check-ins) und {photos} Foto(s). Die Personendaten bleiben in IPAlpha. Das lässt sich nicht rückgängig machen.",
  },
  "Mandamos um código por SMS para o seu celular cadastrado no IPAlpha. Ele vale até {time}.": {
    en: "We sent a code by SMS to your phone registered in IPAlpha. It is valid until {time}.",
    es: "Enviamos un código por SMS a tu celular registrado en IPAlpha. Vale hasta las {time}.",
    fr: "Nous avons envoyé un code par SMS à votre téléphone enregistré dans IPAlpha. Il est valable jusqu'à {time}.",
    de: "Wir haben dir einen Code per SMS an deine in IPAlpha hinterlegte Handynummer geschickt. Er gilt bis {time}.",
  },

  // ── Limpeza ──
  "Apaga os {total} registro(s) dos blocos acima de uma vez — menos as Instruções e a Preparação, que têm botão próprio —, libera a memória dos avisos e zera as datas do check-in, as janelas de acesso, o lembrete e os ensaios. Ficam para o ano que vem: as categorias, as funções e os cadastros das pessoas, que vivem no IPAlpha. Na confirmação dá para escolher quem da equipe fica.": {
    en: "Deletes the {total} record(s) of the blocks above at once — except Instructions and Preparation, which have their own button —, frees the notice memory and resets the check-in dates, access windows, reminder and rehearsals. Kept for next year: the categories, the roles and the people's records, which live in IPAlpha. In the confirmation you can choose who on the team stays.",
    es: "Borra los {total} registro(s) de los bloques de arriba de una vez — excepto Instrucciones y Preparación, que tienen su propio botón —, libera la memoria de los avisos y reinicia las fechas del check-in, las ventanas de acceso, el recordatorio y los ensayos. Quedan para el año que viene: las categorías, las funciones y los registros de las personas, que viven en IPAlpha. En la confirmación puedes elegir quién del equipo se queda.",
    fr: "Supprime d'un coup les {total} enregistrement(s) des blocs ci-dessus — sauf les Instructions et la Préparation, qui ont leur propre bouton —, libère la mémoire des avis et remet à zéro les dates d'accueil, les périodes d'accès, le rappel et les répétitions. Restent pour l'an prochain : les catégories, les fonctions et les fiches des personnes, qui vivent dans IPAlpha. À la confirmation, vous pouvez choisir qui de l'équipe reste.",
    de: "Löscht die {total} Einträge der Bereiche oben auf einmal — außer Anleitungen und Vorbereitung, die einen eigenen Knopf haben —, leert das Gedächtnis der Hinweise und setzt Check-in-Termine, Zugangszeiträume, Erinnerung und Proben zurück. Für nächstes Jahr bleiben: die Kategorien, die Aufgaben und die Personendaten, die in IPAlpha liegen. Bei der Bestätigung kannst du wählen, wer vom Team bleibt.",
  },
  "A participação das crianças neste acampamento: check-ins, histórico de edições das famílias e pontos lidos no crachá. Os cadastros continuam no IPAlpha.": {
    en: "The children's participation in this camp: check-ins, the families' edit history and points read from the badge. Their records stay in IPAlpha.",
    es: "La participación de los niños en este campamento: check-ins, historial de cambios de las familias y puntos leídos en la credencial. Los registros siguen en IPAlpha.",
    fr: "La participation des enfants à ce camp : accueils, historique des modifications des familles et points lus sur le badge. Les fiches restent dans IPAlpha.",
    de: "Die Teilnahme der Kinder an diesem Camp: Check-ins, Änderungsverlauf der Familien und vom Ausweis gelesene Punkte. Die Personendaten bleiben in IPAlpha.",
  },
  "A participação da equipe neste acampamento, suas funções na programação e as listas das configurações. Os cadastros continuam no IPAlpha.": {
    en: "The team's participation in this camp, their roles in the schedule and the settings lists. Their records stay in IPAlpha.",
    es: "La participación del equipo en este campamento, sus funciones en la programación y las listas de la configuración. Los registros siguen en IPAlpha.",
    fr: "La participation de l'équipe à ce camp, ses fonctions dans le programme et les listes des paramètres. Les fiches restent dans IPAlpha.",
    de: "Die Teilnahme des Teams an diesem Camp, seine Aufgaben im Programm und die Listen der Einstellungen. Die Personendaten bleiben in IPAlpha.",
  },
  "As marcações da equipe de cuidado (o que cada criança tomou). A medicação das crianças continua no IPAlpha.": {
    en: "The care team's ticks (what each child took). The children's medication stays in IPAlpha.",
    es: "Las marcas del equipo de cuidado (lo que tomó cada niño). La medicación de los niños sigue en IPAlpha.",
    fr: "Les coches de l'équipe de soin (ce que chaque enfant a pris). Les médicaments des enfants restent dans IPAlpha.",
    de: "Die Häkchen des Fürsorge-Teams (was jedes Kind genommen hat). Die Medikamente der Kinder bleiben in IPAlpha.",
  },
  "Contatos para as famílias": { en: "Contacts for the families", es: "Contactos para las familias", fr: "Contacts pour les familles", de: "Kontakte für die Familien" },

  // ── wizard ──
  "Traga o que já existe de outro acampamento: categorias, times, quartos, ônibus, equipe, acampantes, programação, documentos e configurações. Cada bloco vira registro NOVO deste ano (as pessoas são as mesmas do IPAlpha) — nada aqui altera o ano de origem.": {
    en: "Bring what already exists from another camp: categories, teams, rooms, buses, team, campers, schedule, documents and settings. Each block becomes a NEW record of this year (the people are the same ones in IPAlpha) — nothing here changes the source year.",
    es: "Trae lo que ya existe de otro campamento: categorías, equipos, habitaciones, autobuses, equipo, campistas, programación, documentos y configuración. Cada bloque se vuelve un registro NUEVO de este año (las personas son las mismas de IPAlpha) — nada aquí cambia el año de origen.",
    fr: "Reprenez ce qui existe déjà d'un autre camp : catégories, équipes, chambres, bus, équipe, campeurs, programme, documents et paramètres. Chaque bloc devient un NOUVEL enregistrement de cette année (les personnes sont les mêmes dans IPAlpha) — rien ici ne modifie l'année d'origine.",
    de: "Übernimm, was es schon aus einem anderen Camp gibt: Kategorien, Teams, Zimmer, Busse, Team, Kinder, Programm, Dokumente und Einstellungen. Jeder Bereich wird zu einem NEUEN Eintrag dieses Jahres (die Personen sind dieselben in IPAlpha) — am Ursprungsjahr ändert sich nichts.",
  },
  "{n} pessoa(s) ainda precisa(m) ser incluída(s) nesta edição pelo Mordomia": {
    en: "{n} person(s) still need(s) to be added to this edition in Mordomia",
    es: "{n} persona(s) aún necesita(n) ser incluida(s) en esta edición desde Mordomia",
    fr: "{n} personne(s) doi(ven)t encore être ajoutée(s) à cette édition dans Mordomia",
    de: "{n} Person(en) muss/müssen noch in Mordomia zu dieser Ausgabe hinzugefügt werden",
  },
  "Quem serve na coordenação recebe esse papel no IPAlpha (Mordomia). Depois é só mandar o link: a pessoa entra com o próprio celular, com um código por SMS.": {
    en: "Whoever serves in coordination gets that role in IPAlpha (Mordomia). Then just send the link: the person signs in with their own phone, with a code by SMS.",
    es: "Quien sirve en la coordinación recibe ese rol en IPAlpha (Mordomia). Después solo envía el enlace: la persona entra con su propio celular, con un código por SMS.",
    fr: "La personne qui sert à la coordination reçoit ce rôle dans IPAlpha (Mordomia). Ensuite, envoyez simplement le lien : elle se connecte avec son propre téléphone, avec un code par SMS.",
    de: "Wer in der Koordination dient, bekommt diese Aufgabe in IPAlpha (Mordomia). Danach einfach den Link schicken: Die Person meldet sich mit dem eigenen Handy und einem SMS-Code an.",
  },
};
