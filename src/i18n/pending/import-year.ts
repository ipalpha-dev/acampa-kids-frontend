import type { Locale } from "../locales";

export const LITERALS: Record<string, Partial<Record<Exclude<Locale, "pt">, string>>> = {
  "De onde importar": {
    en: "Where to import from",
    es: "De dónde importar",
    fr: "D'où importer",
    de: "Importieren aus",
  },
  "Ano de origem": {
    en: "Source year",
    es: "Año de origen",
    fr: "Année source",
    de: "Ursprungsjahr",
  },
  "Outro ano": {
    en: "Another year",
    es: "Otro año",
    fr: "Une autre année",
    de: "Anderes Jahr",
  },
  "Importar acampantes": {
    en: "Import campers",
    es: "Importar campistas",
    fr: "Importer des campeurs",
    de: "Kinder importieren",
  },
  "Importar equipe": {
    en: "Import staff",
    es: "Importar equipo",
    fr: "Importer l'équipe",
    de: "Mitarbeitende importieren",
  },
  "Importar de outro ano": {
    en: "Import from another year",
    es: "Importar de otro año",
    fr: "Importer d'une autre année",
    de: "Aus einem anderen Jahr importieren",
  },
  "Não há outro ano para importar.": {
    en: "There is no other year to import from.",
    es: "No hay otro año para importar.",
    fr: "Il n'y a pas d'autre année à importer.",
    de: "Es gibt kein anderes Jahr zum Importieren.",
  },
  "Buscando… 🔍": {
    en: "Searching… 🔍",
    es: "Buscando… 🔍",
    fr: "Recherche… 🔍",
    de: "Wird gesucht… 🔍",
  },
  "Ninguém encontrado em {label}.": {
    en: "No one found in {label}.",
    es: "No se encontró a nadie en {label}.",
    fr: "Personne trouvé dans {label}.",
    de: "Niemand gefunden in {label}.",
  },
  "Selecionar todos ({n})": {
    en: "Select all ({n})",
    es: "Seleccionar todos ({n})",
    fr: "Tout sélectionner ({n})",
    de: "Alle auswählen ({n})",
  },
  "Limpar seleção": {
    en: "Clear selection",
    es: "Limpiar selección",
    fr: "Effacer la sélection",
    de: "Auswahl aufheben",
  },
  "{n} selecionado(s)": {
    en: "{n} selected",
    es: "{n} seleccionado(s)",
    fr: "{n} sélectionné(s)",
    de: "{n} ausgewählt",
  },
  "Importar {n} selecionado(s)": {
    en: "Import {n} selected",
    es: "Importar {n} seleccionado(s)",
    fr: "Importer {n} sélectionné(s)",
    de: "{n} ausgewählte importieren",
  },
  "já está neste ano": {
    en: "already in this year",
    es: "ya está en este año",
    fr: "déjà dans cette année",
    de: "schon in diesem Jahr",
  },
  "Selecionar {name}": {
    en: "Select {name}",
    es: "Seleccionar a {name}",
    fr: "Sélectionner {name}",
    de: "{name} auswählen",
  },
  "Pode repetir sem medo: quem já está neste ano só é atualizado se você marcar.": {
    en: "Safe to repeat: anyone already in this year is only updated if you check them.",
    es: "Puedes repetirlo sin miedo: quien ya está en este año solo se actualiza si lo marcas.",
    fr: "Sans risque à répéter : qui est déjà dans cette année n'est mis à jour que si vous le cochez.",
    de: "Du kannst es ohne Sorge wiederholen: Wer schon in diesem Jahr ist, wird nur aktualisiert, wenn du ihn anhakst.",
  },
  "✅ {n} importado(s)": {
    en: "✅ {n} imported",
    es: "✅ {n} importado(s)",
    fr: "✅ {n} importé(s)",
    de: "✅ {n} importiert",
  },
  "Nome, responsável ou CPF": {
    en: "Name, guardian or CPF",
    es: "Nombre, responsable o CPF",
    fr: "Nom, responsable ou CPF",
    de: "Name, Bezugsperson oder CPF",
  },
  "Nome ou celular": {
    en: "Name or mobile",
    es: "Nombre o celular",
    fr: "Nom ou portable",
    de: "Name oder Handynummer",
  },
};
