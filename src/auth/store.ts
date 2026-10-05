import { api } from "../api/client";
import { deviceLocale } from "../i18n";
import type { CoreRole, LoggedUser } from "../roles";

/**
 * The browser keeps ONLY the opaque Acampa session token (decision 32): the
 * per-role IPAlpha tokens live in the backend's session record. No phone, no
 * person data is stored here.
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

/** Saves the session in the browser; it auto-clears after the token expiry (checked on load). */
export function saveAuth(state: AuthState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/** Returns the stored session if it's still valid (not older than the expiry date) and of the people-in-core shape. */
export function loadAuth(): AuthState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const state = JSON.parse(raw) as AuthState;
    // a session saved by the old phone-based app has no personId: sign in again
    if (!state.token || !state.tokenExpiresAt || !state.user?.personId || !state.camp) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    if (new Date(state.tokenExpiresAt) <= new Date()) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

export function clearAuth(): void {
  localStorage.removeItem(STORAGE_KEY);
}

const OTP_STORAGE_KEY = "acampa.otp";

/**
 * The SMS code that was sent, so leaving the browser (to read the SMS) and
 * coming back keeps the real expiry. The challenge is sealed by the backend;
 * only a MASKED phone is kept, for the "enviamos para …" line.
 */
export interface PendingOtp {
  challenge: string;
  expiresAt: string; // ISO — when the SMS code stops being valid
  codeLength: number;
  /** "(11) •••••-4567" — display only */
  phoneHint: string;
}

export function savePendingOtp(state: PendingOtp): void {
  localStorage.setItem(OTP_STORAGE_KEY, JSON.stringify(state));
}

/** Returns the pending SMS code context if it hasn't expired yet. */
export function loadPendingOtp(): PendingOtp | null {
  try {
    const raw = localStorage.getItem(OTP_STORAGE_KEY);
    if (!raw) return null;

    const state = JSON.parse(raw) as PendingOtp;
    if (!state.challenge || !state.expiresAt) {
      localStorage.removeItem(OTP_STORAGE_KEY);
      return null;
    }
    if (new Date(state.expiresAt) <= new Date()) {
      localStorage.removeItem(OTP_STORAGE_KEY);
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

export function clearPendingOtp(): void {
  localStorage.removeItem(OTP_STORAGE_KEY);
}

export function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

export interface MeResult {
  user: LoggedUser;
  camp: CampSummary;
  camps: CampSummary[];
}

/** Validates the stored token against the backend (GET /api/auth/me). null = the session is gone. */
export async function validateAuth(token: string): Promise<MeResult | null> {
  try {
    const res = await api<{ user: LoggedUser; camp: CampSummary; camps?: CampSummary[] }>("/api/auth/me", {
      headers: bearer(token),
    });
    return { user: res.user, camp: res.camp, camps: res.camps ?? [] };
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
