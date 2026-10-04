import { ApiError, api } from "../api/client";
import type { OtpVerifyResult } from "./store";

/**
 * "Entrar com IPAlpha" — the SPA side of CONTRACTS_ACAMPA §5.
 *
 * The backend holds the secret, the PKCE verifier and the state; this file only opens the
 * IPAlpha popup, waits for its `web_message` hand-off and forwards `{code, state}` back to the
 * backend, which answers with the same session shape as the SMS-code login.
 */

/** `GET /api/auth/ipalpha/config` — public, no secrets. `enabled: false` hides every IPAlpha UI. */
export interface IpalphaConfig {
  enabled: boolean;
  /** Origin of the IPAlpha sign-in webapp (popup + One Tap frame). */
  authOrigin: string;
  clientId: string;
  entryPoint: string;
}

/** `POST /api/auth/ipalpha/start` answer. `state` is optional: when the backend shares it, hand-offs carrying another state are ignored. */
export interface IpalphaStart {
  url: string;
  state?: string;
}

/** `type` of the popup's hand-off message (auth-webapp `web_message`). */
export const AUTH_MESSAGE_TYPE = "ipalpha:auth";

/** How long a popup may stay open waiting for the person (sign-in + consent). */
const POPUP_TIMEOUT_MS = 10 * 60 * 1000;
const POPUP_WIDTH = 480;
const POPUP_HEIGHT = 720;

/** Error codes the IPAlpha paths may answer (§5) that the UI treats specially. */
export const IPALPHA_UNAVAILABLE = "IPALPHA_UNAVAILABLE";

export function isIpalphaUnavailable(err: unknown): boolean {
  return err instanceof ApiError && err.code === IPALPHA_UNAVAILABLE;
}

/** Exact `scheme://host[:port]` of a configured origin, or null when it is not a usable http(s) origin. */
export function exactOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Never throws: any failure (old backend, offline) means the feature is simply off. */
export async function fetchIpalphaConfig(): Promise<IpalphaConfig | null> {
  try {
    const res = await api<Partial<IpalphaConfig>>("/api/auth/ipalpha/config");
    const authOrigin = exactOrigin(res?.authOrigin);
    if (!res?.enabled || !authOrigin || !res.clientId || !res.entryPoint) return null;
    return { enabled: true, authOrigin, clientId: res.clientId, entryPoint: res.entryPoint };
  } catch {
    return null;
  }
}

export function startIpalpha(personHint?: string): Promise<IpalphaStart> {
  return api<IpalphaStart>("/api/auth/ipalpha/start", {
    method: "POST",
    body: JSON.stringify(personHint ? { personHint } : {}),
  });
}

export function completeIpalpha(code: string, state: string): Promise<OtpVerifyResult> {
  return api<OtpVerifyResult>("/api/auth/ipalpha/complete", {
    method: "POST",
    body: JSON.stringify({ code, state }),
  });
}

/**
 * Opens the (still blank) popup synchronously inside the click, so popup blockers see the user
 * gesture; the sign-in URL is set later, once the backend answered `start`.
 */
export function openBlankPopup(): Window | null {
  const left = Math.max(0, (window.screenX ?? 0) + ((window.outerWidth || window.innerWidth) - POPUP_WIDTH) / 2);
  const top = Math.max(0, (window.screenY ?? 0) + ((window.outerHeight || window.innerHeight) - POPUP_HEIGHT) / 2);
  try {
    return window.open("about:blank", "ipalpha-auth", `popup=yes,width=${POPUP_WIDTH},height=${POPUP_HEIGHT},left=${Math.round(left)},top=${Math.round(top)}`);
  } catch {
    return null;
  }
}

export function closePopup(popup: Window | null): void {
  try {
    popup?.close();
  } catch {
    // a cross-origin close may be refused; the transaction is abandoned anyway
  }
}

export type PopupOutcome =
  | { kind: "code"; code: string; state: string }
  | { kind: "denied" }
  | { kind: "error"; error: string }
  | { kind: "closed" }
  | { kind: "timeout" };

export interface AwaitPopupOptions {
  /** Exact origin of the auth webapp; anything else is ignored. */
  authOrigin: string;
  popup: Window;
  /** When known, a hand-off carrying another state is ignored. */
  state?: string;
  timeoutMs?: number;
  /** How often `popup.closed` is checked. */
  pollMs?: number;
}

/**
 * Waits for the popup's hand-off. A message counts only when ALL hold: exact auth origin,
 * `event.source === popup`, `type === 'ipalpha:auth'` and (when known) the expected state.
 * Everything else is silently ignored — this side never posts back.
 */
export function awaitPopupMessage({ authOrigin, popup, state, timeoutMs = POPUP_TIMEOUT_MS, pollMs = 400 }: AwaitPopupOptions): Promise<PopupOutcome> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (outcome: PopupOutcome) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("message", onMessage);
      window.clearInterval(poll);
      window.clearTimeout(timer);
      resolve(outcome);
    };
    function onMessage(event: MessageEvent) {
      if (event.origin !== authOrigin) return;
      if (!event.source || event.source !== popup) return;
      const data = event.data as { type?: unknown; state?: unknown; code?: unknown; error?: unknown } | null;
      if (!data || typeof data !== "object" || data.type !== AUTH_MESSAGE_TYPE) return;
      if (typeof data.state !== "string" || !data.state) return;
      if (state && data.state !== state) return;
      if (typeof data.error === "string" && data.error) {
        finish(data.error === "access_denied" ? { kind: "denied" } : { kind: "error", error: data.error });
        return;
      }
      if (typeof data.code !== "string" || !data.code) return;
      finish({ kind: "code", code: data.code, state: data.state });
    }
    const poll = window.setInterval(() => {
      if (popup.closed) finish({ kind: "closed" });
    }, pollMs);
    const timer = window.setTimeout(() => {
      finish({ kind: "timeout" });
      closePopup(popup);
    }, timeoutMs);
    window.addEventListener("message", onMessage);
  });
}
