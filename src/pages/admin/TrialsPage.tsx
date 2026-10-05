import { useCollection } from "../../store";
import { useI18n } from "../../i18n";
import CheckinTestTools from "./CheckinTestTools";
import KidsRoomsDraftCard from "./KidsRoomsDraftCard";
import ScoreDraftCard from "./ScoreDraftCard";

interface TrialsPageProps {
  token: string;
  /** coordenação (kept for the router; every switch here is shared with organização) */
  isAdmin: boolean;
}

/**
 * Settings → Testes: everything used to REHEARSE before the camp, in one
 * place — the kids' rooms draft (also on Geral), the scoreboard rehearsal,
 * the check-in test mode + reset. (The SMS redirect is gone: messages go
 * through IPAlpha's templates.)
 * Every switch here must be OFF when the camp starts.
 */
export default function TrialsPage({ token }: TrialsPageProps) {
  const { tx } = useI18n();
  const settings = useCollection("settings");

  if (!settings) {
    return (
      <div className="admin-page">
        <p className="opt-empty">{tx("Carregando configurações… ⚙️")}</p>
      </div>
    );
  }

  const anyOn = settings.kidsRoomsDraft || settings.scoreDraft || settings.checkinTestMode;

  return (
    <div className="admin-page">
      <header className="admin-head">
        <h1 className="admin-title">🚧 {tx("Testes")}</h1>
      </header>
      <p className="admin-intro">{tx("Para ensaiar antes do acampamento. Tudo aqui deve estar desligado quando o acampamento começar.")}</p>
      {anyOn && <p className="message message--warn">{tx("⚠️ Há um teste ligado. Confira antes do dia da saída.")}</p>}

      <KidsRoomsDraftCard token={token} />
      <ScoreDraftCard token={token} />
      <CheckinTestTools token={token} />
    </div>
  );
}
