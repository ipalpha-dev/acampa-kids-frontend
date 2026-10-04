import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../api/client";
import { isStaffAccessError } from "../components/StaffAccessDialog";
import { useT } from "../i18n";
import {
  awaitPopupMessage,
  closePopup,
  completeIpalpha,
  exactOrigin,
  isIpalphaUnavailable,
  openBlankPopup,
  startIpalpha,
  type IpalphaConfig,
} from "./ipalpha";
import type { OtpVerifyResult } from "./store";

export interface IpalphaSignIn {
  /** A popup is open / the backend is finishing the sign-in. */
  busy: boolean;
  /** Something the person should fix or retry (shown in the error style). */
  error: string | null;
  /** A gentle note (the person declined in the popup) — never an error style. */
  notice: string | null;
  /** STAFF_ACCESS_* answer: shown by the existing StaffAccessDialog. */
  accessError: ApiError | null;
  clearAccessError: () => void;
  /** Starts the popup sign-in; call it straight from a user gesture (click / One Tap pick). */
  start: (personHint?: string) => void;
}

interface Options {
  config: IpalphaConfig | null;
  onSignedIn: (res: OtpVerifyResult) => void;
  /** IPALPHA_UNAVAILABLE: core is down → the maintenance scene. */
  onUnavailable: () => void;
}

/** Popup sign-in with IPAlpha (CONTRACTS_ACAMPA §5): blank popup on the gesture → start → hand-off → complete. */
export function useIpalphaSignIn({ config, onSignedIn, onUnavailable }: Options): IpalphaSignIn {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [accessError, setAccessError] = useState<ApiError | null>(null);
  const popupRef = useRef<Window | null>(null);
  const alive = useRef(true);
  const callbacks = useRef({ onSignedIn, onUnavailable });
  callbacks.current = { onSignedIn, onUnavailable };

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const fail = useCallback(
    (err: unknown) => {
      if (!alive.current) return;
      if (isIpalphaUnavailable(err)) {
        callbacks.current.onUnavailable();
      } else if (isStaffAccessError(err)) {
        setAccessError(err);
      } else if (err instanceof ApiError && err.code === "IPALPHA_DENIED") {
        setNotice(t("login.ipalphaDenied"));
      } else if (err instanceof ApiError && err.code === "NO_PROFILE") {
        setError(t("login.ipalphaNoProfile"));
      } else if (err instanceof ApiError && (err.code === "ACCOUNT_FROZEN" || err.code === "OFFLINE")) {
        setError(err.message);
      } else {
        setError(t("login.ipalphaFailed"));
      }
    },
    [t],
  );

  const start = useCallback(
    (personHint?: string) => {
      if (!config) return;
      const open = popupRef.current;
      if (open && !open.closed) {
        open.focus();
        return;
      }
      setError(null);
      setNotice(null);
      // synchronously, inside the gesture: blockers allow it, the URL comes later
      const popup = openBlankPopup();
      if (!popup) {
        setError(t("login.popupBlocked"));
        return;
      }
      popupRef.current = popup;
      setBusy(true);

      void (async () => {
        try {
          const started = await startIpalpha(personHint);
          // the popup may only ever be sent to the IPAlpha sign-in origin
          if (exactOrigin(started?.url) !== config.authOrigin) throw new Error("unexpected sign-in url");
          if (popup.closed) return;
          popup.location.href = started.url;

          const outcome = await awaitPopupMessage({ authOrigin: config.authOrigin, popup, state: started.state });
          if (outcome.kind === "closed" || outcome.kind === "timeout") return;
          closePopup(popup);
          if (outcome.kind === "denied") {
            if (alive.current) setNotice(t("login.ipalphaDenied"));
            return;
          }
          if (outcome.kind === "error") {
            if (alive.current) setError(t("login.ipalphaFailed"));
            return;
          }
          const res = await completeIpalpha(outcome.code, outcome.state);
          if (alive.current) callbacks.current.onSignedIn(res);
        } catch (err) {
          closePopup(popup);
          fail(err);
        } finally {
          if (popupRef.current === popup) popupRef.current = null;
          if (alive.current) setBusy(false);
        }
      })();
    },
    [config, fail, t],
  );

  return { busy, error, notice, accessError, clearAccessError: () => setAccessError(null), start };
}
