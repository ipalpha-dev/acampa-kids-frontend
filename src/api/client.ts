export class ApiError extends Error {
  code: string;
  status: number;
  attemptsLeft?: number;
  minutesLeft?: number;
  secondsLeft?: number;
  opensAt?: string | null;
  closesAt?: string | null;
  /** access-window errors: who the window is for */
  audience?: "staff" | "parent";
  /** core's refusal detail (403 CORE_FORBIDDEN / 409 CORE_REJECTED), e.g. "decisionsPending" */
  reason?: string;

  constructor(
    status: number,
    code: string,
    message: string,
    extra?: { attemptsLeft?: number; minutesLeft?: number; secondsLeft?: number; opensAt?: string | null; closesAt?: string | null; audience?: "staff" | "parent"; reason?: string },
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.attemptsLeft = extra?.attemptsLeft;
    this.minutesLeft = extra?.minutesLeft;
    this.secondsLeft = extra?.secondsLeft;
    this.opensAt = extra?.opensAt;
    this.closesAt = extra?.closesAt;
    this.audience = extra?.audience;
    this.reason = extra?.reason;
  }
}

// In production the API is served by the same origin through the /api Ingress.
// VITE_API_URL is only needed when development uses a separate backend.
const BASE = import.meta.env.VITE_API_URL || window.location.origin;

/** Writes need the server; when it can't be reached this is what the user sees. */
export const OFFLINE_MESSAGE = "Sem conexão com o servidor. Verifique o Wi-Fi do acampamento e tente novamente.";

/** Fired on `window` when an authenticated call answers 401 (see App.tsx). */
export const SESSION_ENDED_EVENT = "acampa:session-ended";
/** Fired on `window` when an authenticated call answers 503 IPALPHA_UNAVAILABLE. */
export const CORE_UNAVAILABLE_EVENT = "acampa:core-unavailable";

function hasBearer(options?: RequestInit): boolean {
  const headers = options?.headers;
  if (!headers) return false;
  if (headers instanceof Headers) return headers.has("authorization");
  if (Array.isArray(headers)) return headers.some(([k]) => k.toLowerCase() === "authorization");
  return Object.keys(headers).some((k) => k.toLowerCase() === "authorization");
}

/**
 * The one place an AUTHENTICATED call's failure becomes app-wide news — the
 * JSON client below and every raw fetch (multipart uploads, streams) call it:
 *  - 401: core revoked / expired the role token (SESSION_ENDED) or the Acampa
 *    session is gone — App.tsx wipes the offline copy + upload caches and
 *    returns to the login with a gentle note;
 *  - 503 IPALPHA_UNAVAILABLE: the camp keeps working from memory; App.tsx shows a gentle note.
 */
export function signalAuthFailure(status: number, code: string): void {
  if (status === 401) window.dispatchEvent(new CustomEvent(SESSION_ENDED_EVENT, { detail: { code } }));
  if (status === 503 && code === "IPALPHA_UNAVAILABLE") window.dispatchEvent(new CustomEvent(CORE_UNAVAILABLE_EVENT));
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  let res: Response;
  // FormData bodies must keep the browser-generated multipart boundary, so we
  // only default to JSON when the caller isn't uploading a file.
  const isFormData = typeof FormData !== "undefined" && options?.body instanceof FormData;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...options,
      headers: {
        ...(isFormData ? {} : { "content-type": "application/json" }),
        ...((options?.headers as Record<string, string> | undefined) ?? {}),
      },
    });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err;
    throw new ApiError(0, "OFFLINE", OFFLINE_MESSAGE);
  }

  const data = (await res.json().catch(() => null)) as
    | T
    | { error?: { code?: string; message?: string; attemptsLeft?: number; minutesLeft?: number; secondsLeft?: number } }
    | null;

  if (!res.ok) {
    const err = (data as { error?: Record<string, unknown> } | null)?.error;
    const code = (err?.code as string) ?? "UNKNOWN";
    const message = (err?.message as string) ?? "Algo deu errado. Tente novamente.";
    // a write blocked by an archived year, or a switch to a camp this session
    // may not enter: App.tsx listens for this to toast / bounce back, from one place
    if (code === "CAMP_ARCHIVED" || code === "CAMP_FORBIDDEN") {
      window.dispatchEvent(new CustomEvent("acampa:camp-error", { detail: { code, message } }));
    }
    if (hasBearer(options)) signalAuthFailure(res.status, code);
    throw new ApiError(
      res.status,
      code,
      message,
      {
        attemptsLeft: err?.attemptsLeft as number | undefined,
        minutesLeft: err?.minutesLeft as number | undefined,
        secondsLeft: err?.secondsLeft as number | undefined,
        opensAt: err?.opensAt as string | null | undefined,
        closesAt: err?.closesAt as string | null | undefined,
        audience: err?.audience as "staff" | "parent" | undefined,
        reason: typeof err?.reason === "string" ? err.reason : undefined,
      },
    );
  }

  return data as T;
}

/** A REST command whose resulting application state must arrive by WebSocket. */
export async function command<T>(path: string, options: RequestInit, collections: readonly import("../store").CollectionName[]): Promise<T> {
  const { prepareCollectionWait } = await import("../store/realtime");
  const waiter = prepareCollectionWait(collections);
  try {
    const result = await api<T>(path, options);
    await waiter.promise;
    return result;
  } catch (error) {
    waiter.cancel();
    throw error;
  }
}
