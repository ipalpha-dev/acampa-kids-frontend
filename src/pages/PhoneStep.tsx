import { useEffect, useState } from "react";
import { ApiError } from "../api/client";
import { fetchActiveCamp } from "../api/camps";
import { isIpalphaUnavailable } from "../auth/ipalpha";
import { requestOtp } from "../auth/store";
import IpalphaSignInButton from "../components/ipalpha/IpalphaSignInButton";
import PhoneInput from "../components/PhoneInput";
import StaffAccessDialog, { isStaffAccessError } from "../components/StaffAccessDialog";
import { useT } from "../i18n";
import { isCompleteMobile, toE164 } from "../phone";
import { campBrandLabel } from "../camps";

interface PhoneStepProps {
  phone: string; // masked
  onPhoneChange: (masked: string) => void;
  onSent: (info: { phoneE164: string; expiresAt: string; delivery: "sms" | "mock" | "redirect" }) => void;
  /** IPALPHA_UNAVAILABLE (the code is relayed through IPAlpha): show the maintenance scene. */
  onUnavailable: () => void;
  /** "Entrar com IPAlpha" below the form — absent when the backend has the feature off. */
  ipalpha?: {
    busy: boolean;
    error: string | null;
    notice: string | null;
    onStart: () => void;
  };
}

/** Step 1 — Brazilian cell phone entry (rendered inside the green panel). */
export default function PhoneStep({ phone, onPhoneChange, onSent, onUnavailable, ipalpha }: PhoneStepProps) {
  const t = useT();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accessError, setAccessError] = useState<ApiError | null>(null);
  const [campLabel, setCampLabel] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchActiveCamp()
      .then((c) => alive && setCampLabel(campBrandLabel(c.label, c.year)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const phoneE164 = toE164(phone);
    if (!phoneE164) {
      setError(t("login.phoneInvalid"));
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await requestOtp(phoneE164);
      onSent({ phoneE164, expiresAt: res.expiresAt, delivery: res.delivery });
    } catch (err) {
      if (isIpalphaUnavailable(err)) {
        onUnavailable();
      } else if (isStaffAccessError(err)) {
        setAccessError(err);
      } else if (err instanceof ApiError && err.code === "ACCOUNT_FROZEN") {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : t("login.genericError"));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <h1 className="camping-panel__title">{t("login.phoneTitle")}</h1>
      {campLabel && <p className="camping-panel__camp">{campLabel}</p>}

      <form className="form" onSubmit={handleSubmit}>
        <PhoneInput value={phone} onChange={onPhoneChange} disabled={loading} autoFocus />

        <button
          type="submit"
          className="button button--primary"
          disabled={loading || !isCompleteMobile(phone)}
        >
          {loading ? t("login.sending") : t("login.continue")}
        </button>

        {error && <p className="message message--error">{error}</p>}
      </form>

      {ipalpha && (
        <IpalphaSignInButton busy={ipalpha.busy} disabled={loading} error={ipalpha.error} notice={ipalpha.notice} onStart={ipalpha.onStart} />
      )}

      <StaffAccessDialog error={accessError} onClose={() => setAccessError(null)} />
    </>
  );
}
