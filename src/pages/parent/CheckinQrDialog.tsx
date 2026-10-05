import { useEffect, useState } from "react";
import type { Camper } from "../../api/campers";
import CamperQr from "../../components/CamperQr";
import Dialog from "../../components/Dialog";
import KidIcon from "../../components/KidIcon";
import { kidIconSex } from "../../icons";
import { useI18n } from "../../i18n";

interface CheckinQrDialogProps {
  kids: Camper[];
  /** the kids' check-in window is open right now */
  active: boolean;
}

/**
 * While the check-in window is open the parent's phone shows the kids' QR
 * codes in a popup the moment the app opens — so the team scans them and the
 * check-in goes fast. It can be dismissed, but it is STICKY on purpose: it
 * pops again whenever the browser is reopened AND whenever the tab comes
 * back to the foreground (dismissal is kept in memory only). Kids already
 * checked in are left out; once everyone is in it stops showing.
 */
export default function CheckinQrDialog({ kids, active }: CheckinQrDialogProps) {
  const { tx } = useI18n();
  const pending = kids.filter((k) => !k.checkin);
  const [dismissed, setDismissed] = useState(false);
  const [selectedKidId, setSelectedKidId] = useState<string | null>(null);

  useEffect(() => {
    if (!pending.length) return;
    if (!selectedKidId || !pending.some((kid) => kid.id === selectedKidId)) {
      setSelectedKidId(pending[0].id);
    }
  }, [pending, selectedKidId]);

  // tab back to the foreground → show again
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") setDismissed(false);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("pageshow", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("pageshow", onVisible);
    };
  }, []);

  const open = active && pending.length > 0 && !dismissed;
  const selectedKid = pending.find((kid) => kid.id === selectedKidId) ?? pending[0];
  if (!selectedKid) return null;

  return (
    <Dialog open={open} onClose={() => setDismissed(true)} title={tx("Check-in: mostre o QR code")} width={480}>
      <div className="cat-form qr-dialog">
        <h2 className="cat-form__title">{tx("✅ Hora do check-in!")}</h2>
        <p className="cat-hint">{pending.length === 1 ? tx("Mostre este QR code para a equipe na entrada. 🏕️") : tx("Mostre um QR code de cada vez para a equipe na entrada. 🏕️")}</p>
        {pending.length > 1 && (
          <nav className="parent-kid-tabs qr-dialog__tabs" role="tablist" aria-label={tx("Escolha o QR code da criança")}>
            {pending.map((kid) => {
              const selected = kid.id === selectedKid.id;
              return (
                <button
                  key={kid.id}
                  id={`checkin-qr-tab-${kid.id}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls="checkin-qr-panel"
                  tabIndex={selected ? 0 : -1}
                  className={`parent-kid-tab ${selected ? "parent-kid-tab--active" : ""}`}
                  onClick={() => setSelectedKidId(kid.id)}
                  onKeyDown={(event) => {
                    const index = pending.findIndex((item) => item.id === kid.id);
                    const nextIndex = event.key === "ArrowRight" ? (index + 1) % pending.length
                      : event.key === "ArrowLeft" ? (index - 1 + pending.length) % pending.length
                        : event.key === "Home" ? 0
                          : event.key === "End" ? pending.length - 1
                            : null;
                    if (nextIndex === null) return;
                    event.preventDefault();
                    const next = pending[nextIndex].id;
                    setSelectedKidId(next);
                    requestAnimationFrame(() => document.getElementById(`checkin-qr-tab-${next}`)?.focus());
                  }}
                >
                  <KidIcon sex={kidIconSex(undefined, kid.sex) ?? "girl"} size={26} />
                  <span>{kid.name.split(" ")[0] || "…"}</span>
                </button>
              );
            })}
          </nav>
        )}
        <div
          id="checkin-qr-panel"
          className="qr-dialog__codes"
          role={pending.length > 1 ? "tabpanel" : undefined}
          aria-labelledby={pending.length > 1 ? `checkin-qr-tab-${selectedKid.id}` : undefined}
        >
          <CamperQr key={selectedKid.id} camperId={selectedKid.id} name={selectedKid.name} size={240} />
        </div>
        <div className="cat-form__actions">
          <button type="button" className="button button--secondary" onClick={() => setDismissed(true)}>
            {tx("Fechar")}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
