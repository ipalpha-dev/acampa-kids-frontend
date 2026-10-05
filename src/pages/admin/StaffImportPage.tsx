import ImportPage from "./ImportPage";

interface Props {
  token: string;
  /** where "Ver equipe" / the breadcrumb lead — the setup wizard continues instead of leaving */
  onBack?: () => void;
}

/** Equipe → Importar (planilha): the IPAlpha import with the team preselected. */
export default function StaffImportPage({ token, onBack }: Props) {
  return <ImportPage token={token} subject="team" onDone={onBack} />;
}
