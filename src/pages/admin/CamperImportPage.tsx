import ImportPage from "./ImportPage";

interface Props {
  token: string;
  /** where "Ver acampantes" / the breadcrumb lead — the setup wizard continues instead of leaving */
  onDone?: () => void;
}

/** Acampantes → Importar (planilha): the IPAlpha import with the kids preselected. */
export default function CamperImportPage({ token, onDone }: Props) {
  return <ImportPage token={token} subject="camper" onDone={onDone} />;
}
