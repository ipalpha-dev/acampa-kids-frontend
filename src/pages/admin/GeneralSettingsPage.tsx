import { useCollection } from "../../store";
import { useI18n } from "../../i18n";
import AccessWindowCard from "./AccessWindowCard";
import CheckinReminderCard from "./CheckinReminderCard";
import ForeignLookupsCard from "./ForeignLookupsCard";
import ImportHealthCard from "./ImportHealthCard";
import KidsRoomsDraftCard from "./KidsRoomsDraftCard";

interface GeneralSettingsPageProps {
  token: string;
}

/**
 * Admin-only "Geral":
 *   1. the ACCESS window of the ordinary team (people serving with no helper
 *      role in IPAlpha — organização, saúde, check-in… — nor parent contacts)
 *      — outside it the server sends them nothing and the app shows no data;
 *   2. the ACCESS window of the parents (same idea; the welcome SMS goes out when it opens);
 *   3. the check-in reminder date (SMS to the whole team; also on Notificações);
 *   4. the "kids' rooms still a draft" switch (hides kids from caretakers, mutes room SMS) — also on Testes;
 *   5. the foreign-lookup counters and the paused import health passes (decision 50).
 * The scoreboard rehearsal and the check-in test tools live on Testes.
 */
export default function GeneralSettingsPage({ token }: GeneralSettingsPageProps) {
  const { tx } = useI18n();
  const settings = useCollection("settings");

  if (!settings) {
    return (
      <div className="admin-page">
        <p className="opt-empty">{tx("Carregando configurações… ⚙️")}</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <header className="admin-head">
        <h1 className="admin-title">⚙️ {tx("Geral")}</h1>
      </header>

      <AccessWindowCard token={token} which="staffAccessWindow" />
      <AccessWindowCard token={token} which="parentAccessWindow" />

      <CheckinReminderCard token={token} />

      <KidsRoomsDraftCard token={token} />

      <ForeignLookupsCard token={token} />

      <ImportHealthCard token={token} />
    </div>
  );
}
