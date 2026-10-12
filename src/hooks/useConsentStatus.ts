import { useEffect, useState } from "react";
import { fetchConsentStatus } from "../api/consents";
import { loadAuth } from "../auth/store";

/**
 * The team's per-child authorization status, read live through Acampa (persons-api consent-status with the acting role
 * token). Ids + a yes/no only, kept in memory for a few seconds so a list of cards reads it once — never on the device.
 * `null` = nothing to show (not loaded, the role may not see it, or the read failed).
 */
const FRESH_MS = 30_000;

type Snapshot = { token: string; at: number; byId: Map<string, boolean> | null };
let snapshot: Snapshot | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function load(token: string): Promise<void> {
  if (inflight) return inflight;
  inflight = fetchConsentStatus(token)
    .then((s) => {
      snapshot = { token, at: Date.now(), byId: s.visible ? new Map(s.items.map((i) => [i.personId, i.accepted])) : null };
    })
    .catch(() => {
      snapshot = { token, at: Date.now(), byId: null };
    })
    .finally(() => {
      inflight = null;
      for (const fn of listeners) fn();
    });
  return inflight;
}

/** tests only */
export function resetConsentStatus(): void {
  snapshot = null;
  inflight = null;
}

export function useConsentStatus(personId: string): boolean | null {
  const token = loadAuth()?.token ?? "";
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!token) return;
    const rerender = () => setTick((n) => n + 1);
    listeners.add(rerender);
    if (!snapshot || snapshot.token !== token || Date.now() - snapshot.at > FRESH_MS) void load(token);
    const onVisible = () => {
      if (document.visibilityState === "visible" && snapshot && Date.now() - snapshot.at > FRESH_MS) void load(token);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      listeners.delete(rerender);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [token]);
  if (!snapshot || snapshot.token !== token || !snapshot.byId) return null;
  return snapshot.byId.get(personId) ?? null;
}
