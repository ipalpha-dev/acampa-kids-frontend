import { useState } from "react";
import { resetCheckins, updateSettings } from "../../api/settings";
import { useConfirm } from "../../components/ConfirmDialog";
import Toggle from "../../components/Toggle";
import { useI18n } from "../../i18n";
import { useCollection } from "../../store";

interface CheckinTestToolsProps {
  token: string;
}

/**
 * Rehearsal tools for the check-in team, on Configurações → Testes:
 *
 *   - test mode: the KIDS' church + bus roll calls open for the helpers even
 *     outside the check-in window (the team's own self check-in keeps its
 *     departure-day rule);
 *   - reset: clears every check-in (kids church + both bus trips, team) and the log.
 */
export default function CheckinTestTools({ token }: CheckinTestToolsProps) {
  const { tx, te } = useI18n();
  const settings = useCollection("settings");
  const campers = useCollection("campers");
  const staff = useCollection("staff");
  const confirm = useConfirm();
  const [busy, setBusy] = useState<"test" | "reset" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const testMode = !!settings?.checkinTestMode;
  const kidsChecked = campers?.filter((k) => k.checkin || k.busCheckin || k.busReturnCheckin).length ?? 0;
  const staffChecked = staff?.filter((s) => s.checkin).length ?? 0;
  const vestsOut = staff?.filter((s) => s.vest?.delivered).length ?? 0;

  async function toggleTest(value: boolean) {
    if (busy) return;
    setBusy("test");
    setError(null);
    setDone(null);
    try {
      await updateSettings(token, { checkinTestMode: value });
    } catch (e) {
      setError(te(e, "Algo deu errado."));
    } finally {
      setBusy(null);
    }
  }

  async function reset() {
    if (busy) return;
    const ok = await confirm({
      emoji: "🧹",
      title: tx("Zerar todos os check-ins?"),
      message: tx("Isso apaga o check-in de {kids} criança(s), {staff} pessoa(s) da equipe e {vests} colete(s), além do histórico. Não pode ser desfeito.", {
        kids: kidsChecked,
        staff: staffChecked,
        vests: vestsOut,
      }),
      confirmLabel: tx("Zerar check-ins"),
      danger: true,
    });
    if (!ok) return;
    setBusy("reset");
    setError(null);
    setDone(null);
    try {
      const r = await resetCheckins(token);
      setDone(tx("Check-ins zerados: {kids} criança(s), {staff} pessoa(s) da equipe e {vests} colete(s).", {
        kids: r.campers,
        staff: r.staff,
        vests: r.vests,
      }));
    } catch (e) {
      setError(te(e, "Algo deu errado."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="cat-form">
      <div className="cat-form__head">
        <h2 className="cat-form__title">🧪 {tx("Teste do check-in")}</h2>
        <Toggle checked={testMode} disabled={!settings || busy !== null} label={testMode ? tx("Modo de teste ligado") : tx("Modo de teste desligado")} onChange={(v) => void toggleTest(v)} />
      </div>
      <p className="cat-hint">
        {tx("Para a equipe do check-in ensaiar antes do dia da saída: libera")} <strong>{tx("igreja")}</strong>, <strong>{tx("ônibus")}</strong> {tx("e")}{" "}
        <strong>{tx("coletes")}</strong> {tx("fora da janela.")}
      </p>
      {error && <p className="message message--error">{error}</p>}
      {done && <p className="message message--ok">✅ {done}</p>}
      {testMode && <p className="cat-hint cat-hint--error">{tx("⚠️ Igreja e ônibus liberados agora. Desligue antes do dia da saída!")}</p>}
      <div className="settings-tools">
        <button type="button" className="button button--danger" disabled={busy !== null} onClick={() => void reset()}>
          {busy === "reset"
            ? tx("Zerando…")
            : tx("🧹 Zerar check-ins ({kids} crianças · {staff} equipe · {vests} coletes)", {
                kids: kidsChecked,
                staff: staffChecked,
                vests: vestsOut,
              })}
        </button>
      </div>
    </section>
  );
}
