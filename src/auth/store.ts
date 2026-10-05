import { api } from "../api/client";
import { deviceLocale } from "../i18n";
import type { CoreRole, LoggedUser } from "../roles";

/**
 * The browser keeps ONLY the opaque Acampa session token + its (non-personal)
 * expiry (decision 32, CONTRACTS_ACAMPA §24): the per-role IPAlpha tokens live
 * in the backend's session record, and the person's identity (name, roles,
 * personId, camp) is read with `GET /api/auth/me` at load and kept in memory.
 * No name, role, personId or user object ever reaches localStorage.
 */
const STORAGE_KEY = "acampa.auth";

/** One camp in the registry, as a session carries it. */
export interface CampSummary {
  id: string;
  label: string;
  year: number;
  active: boolean;
  archivedAt?: string | null;
}

export interface AuthState {
  token: string;
  tokenExpiresAt: string; // ISO — sliding (sessionIdleHours)
  user: LoggedUser;
  camp: CampSummary;
  /** every camp this session may switch into — empty when it can't switch years */
  camps: CampSummary[];
}

/** What localStorage holds: the opaque token and when it stops being valid. Nothing else. */
export interface StoredSession {
  token: string;
  tokenExpiresAt: string;
}

/** The live session of this tab — memory only, gone with the tab. */
let current: AuthState | null = null;

function writeStored(stored: StoredSession): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: stored.token, tokenExpiresAt: stored.tokenExpiresAt }));
  } catch {
    // storage unavailable (private mode quota): the session lives in memory for this tab
  }
}

function expired(iso: string): boolean {
  const at = new Date(iso).getTime();
  return !Number.isFinite(at) || at <= Date.now();
}

/** Keeps the session in memory and ONLY its token + expiry on the device. */
export function saveAuth(state: AuthState): void {
  current = state;
  writeStored(state);
}

/** The live session (memory), or null when signed out / expired. */
export function loadAuth(): AuthState | null {
  if (current && expired(current.tokenExpiresAt)) return null;
  return current;
}

/**
 * The token left on this device by a previous page view, or null. Migrates the
 * old shape: a stored user object (name, roles, personId…) is dropped on sight,
 * keeping only the token + expiry; a session of the old phone-based app (a user
 * without personId) cannot be used and is removed whole.
 */
export function loadStoredSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession> & { user?: { personId?: string } } & Record<string, unknown>;
    const legacyPhoneSession = "user" in parsed && !parsed.user?.personId;
    if (!parsed.token || !parsed.tokenExpiresAt || legacyPhoneSession || expired(parsed.tokenExpiresAt)) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    const stored = { token: parsed.token, tokenExpiresAt: parsed.tokenExpiresAt };
    // anything besides the token + expiry (an old user / camp object) leaves the device now
    if (Object.keys(parsed).some((k) => k !== "token" && k !== "tokenExpiresAt")) writeStored(stored);
    return stored;
  } catch {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // storage unavailable
    }
    return null;
  }
}

export function clearAuth(): void {
  current = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage unavailable
  }
}

/** Where an older build kept the pending SMS step (challenge + masked phone): never written any more. */
const OTP_STORAGE_KEY = "acampa.otp";

/**
 * The SMS code that was sent. Memory only (App state): not even the masked
 * phone touches the device — a reload goes back to the phone step and the
 * person types the number again.
 */
export interface PendingOtp {
  challenge: string;
  expiresAt: string; // ISO — when the SMS code stops being valid
  codeLength: number;
  /** "(11) •••••-4567" — display only, in memory */
  phoneHint: string;
}

/** Removes the pending SMS step an older build left in localStorage (it held the masked phone). */
export function purgeStoredPendingOtp(): void {
  try {
    localStorage.removeItem(OTP_STORAGE_KEY);
  } catch {
    // storage unavailable: nothing to remove
  }
}

// a stale value from an older build leaves the device as soon as the app loads
purgeStoredPendingOtp();

export function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

export interface MeResult {
  user: LoggedUser;
  camp: CampSummary;
  camps: CampSummary[];
  /** sliding expiry — absent when the backend did not answer one (keep the current) */
  tokenExpiresAt?: string;
}

/**
 * Reads the session's identity (GET /api/auth/me). Throws the ApiError: a 401
 * also fires SESSION_ENDED (api/client.ts); OFFLINE / 503 leave the token alone.
 */
export async function fetchMe(token: string): Promise<MeResult> {
  const res = await api<{ user: LoggedUser; camp: CampSummary; camps?: CampSummary[]; tokenExpiresAt?: string }>("/api/auth/me", {
    headers: bearer(token),
    cache: "no-store",
  });
  return { user: res.user, camp: res.camp, camps: res.camps ?? [], tokenExpiresAt: res.tokenExpiresAt || undefined };
}

/** Validates the token (GET /api/auth/me). null = the session is gone or the server could not be reached. */
export async function validateAuth(token: string): Promise<MeResult | null> {
  try {
    return await fetchMe(token);
  } catch {
    return null;
  }
}

export interface OtpRequestResult {
  success: boolean;
  /** sealed relay challenge — goes back with the code */
  challenge: string;
  codeLength: number;
  expiresAt: string;
  expireMinutes: number;
  delivery: "sms";
}

export async function requestOtp(phoneE164: string): Promise<OtpRequestResult> {
  return api<OtpRequestResult>("/api/auth/otp/request", {
    method: "POST",
    body: JSON.stringify({ phone: phoneE164, locale: deviceLocale() }),
  });
}

/** Answer of every login path (SMS code or IPAlpha popup). */
export interface LoginResult {
  success: boolean;
  token: string;
  tokenExpiresAt: string;
  sessionIdleHours?: number;
  user: LoggedUser;
  camp: CampSummary;
  camps?: CampSummary[];
}
/** @deprecated name kept for the IPAlpha popup module */
export type OtpVerifyResult = LoginResult;

export async function verifyOtp(challenge: string, code: string): Promise<LoginResult> {
  return api<LoginResult>("/api/auth/otp/verify", {
    method: "POST",
    body: JSON.stringify({ challenge, code }),
  });
}

/** Role / camp switch: the SAME token keeps working; the server answers the new view of the session. */
export interface SwitchResult {
  success: boolean;
  tokenExpiresAt: string;
  user: LoggedUser;
  camp: CampSummary;
  camps?: CampSummary[];
}

/**
 * Acts as another role the person holds (no SMS). Re-checked live in core: a
 * role that is gone answers 403 ROLE_FORBIDDEN and leaves `user.roles`.
 */
export async function switchRole(token: string, role: CoreRole): Promise<SwitchResult> {
  return api<SwitchResult>("/api/auth/role", {
    method: "POST",
    headers: bearer(token),
    body: JSON.stringify({ role }),
  });
}

/** Switches the session into another camp (year) — coordenação / super admin only. */
export async function switchCamp(token: string, campId: string): Promise<SwitchResult> {
  return api<SwitchResult>("/api/auth/camp", {
    method: "POST",
    headers: bearer(token),
    body: JSON.stringify({ campId }),
  });
}

/** `GET /api/auth/offline-key` — the per-session key of the encrypted offline copy (never persisted). */
export interface OfflineKeyAnswer {
  /** base64, 32 bytes */
  key: string;
  alg: "AES-GCM";
  role: CoreRole;
  /** health may be kept offline only by saúde / coordenação */
  healthAllowed: boolean;
  sessionExpiresAt: string;
  campEndsAt: string | null;
}

export async function fetchOfflineKey(token: string): Promise<OfflineKeyAnswer> {
  return api<OfflineKeyAnswer>("/api/auth/offline-key", { headers: bearer(token), cache: "no-store" });
}

export async function logout(token: string): Promise<void> {
  try {
    await api("/api/auth/logout", { method: "POST", headers: bearer(token) });
  } catch {
    // best effort — clear locally anyway
  }
  clearAuth();
}

/** "(11) •••••-4567" from an E.164 Brazilian number — the only form of the phone the app keeps. */
export function maskPhone(e164: string): string {
  const digits = e164.replace(/\D/g, "").replace(/^55/, "");
  if (digits.length < 6) return "";
  return `(${digits.slice(0, 2)}) •••••-${digits.slice(-4)}`;
}
