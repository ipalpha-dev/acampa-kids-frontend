import { useState } from "react";
import { updateSettings } from "../../api/settings";
import Toggle from "../../components/Toggle";
import { ICONS } from "../../icons";
import { useCollection } from "../../store";
import { useI18n } from "../../i18n";

interface KidsRoomsDraftCardProps {
  token: string;
}

/**
 * Settings → Geral and → Testes: "kids' rooms not defined yet". While on, room caretakers
 * don't see the kids of their room and no room-change SMS goes out (kids
 * moving rooms, or the person's own room changing).
 */
export default function KidsRoomsDraftCard({ token }: KidsRoomsDraftCardProps) {
  const { tx, te } = useI18n();
  const settings = useCollection("settings");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draft = !!settings?.kidsRoomsDraft;

  async function toggle(value: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await updateSettings(token, { kidsRoomsDraft: value });
    } catch (e) {
      setError(te(e, "Algo deu errado."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="cat-form">
      <div className="cat-form__head">
        <h2 className="cat-form__title"><img className="audience-icon" src={ICONS.bed} alt="" aria-hidden="true" /> {tx("Quartos em rascunho")}</h2>
        <Toggle checked={draft} disabled={!settings || busy} label={draft ? tx("Ainda não definidos") : tx("Definidos")} onChange={(v) => void toggle(v)} />
      </div>
      <p className="cat-hint">
        {tx("Ligue enquanto a organização ainda está montando os quartos.")}
        <br />
        {tx("Nesse período")} <strong>{tx("ninguém da equipe vê o próprio quarto nem as crianças que estão no seu quarto")}</strong>.
        <br />
        {tx("Desligue quando todos os quartos já tiverem definidos.")}
      </p>
      {error && <p className="message message--error">{error}</p>}
      {draft && <p className="cat-hint cat-hint--error">{tx("⚠️ A equipe não está vendo os quartos. Desligue quando os quartos estiverem definidos.")}</p>}
    </section>
  );
}
