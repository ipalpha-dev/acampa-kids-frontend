import { applyServerData, setConnection, type ServerCollections as Collections } from "./index";

/**
 * Keeps ONE WebSocket to the backend while the user is logged in.
 * Reconnects with backoff, so a phone that loses the camp Wi-Fi for a while
 * picks the live feed back up on its own. While disconnected the app keeps
 * showing what is in localStorage.
 */

// In production the API is served by the same origin through the /api Ingress.
// VITE_API_URL is only needed when development uses a separate backend.
const BASE = import.meta.env.VITE_API_URL || window.location.origin;

function wsUrl(token: string): string {
  const u = new URL("/api/realtime", BASE);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  u.searchParams.set("token", token);
  return u.toString();
}

type ServerMessage =
  | { type: "snapshot"; at: string; data: Partial<Collections> }
  | { type: "update"; at: string; data: Partial<Collections> }
  | { type: "ping"; at: string }
  | { type: "import-progress"; at: string; data: ImportProgressEvent }
  | { type: "import-batch"; at: string; data: ImportBatchEvent }
  | { type: "error"; code: string; message: string };

/** A people import (persons-api, CONTRACTS_ACAMPA §20/§24) moved a step — only the importer's sockets hear it. */
export interface ImportProgressEvent {
  importId: string;
  step: string;
  done: number;
  total: number;
  status: string;
  batch?: number;
}

/** One batch of an import was applied (counts only — the rows are read with GET /api/imports/:id/results). */
export interface ImportBatchEvent {
  importId: string;
  batch: number;
  rows: number;
  applied: number;
  unfilled: number;
}

/** Fired on `window` with `detail: ImportProgressEvent`. */
export const IMPORT_PROGRESS_EVENT = "acampa:import-progress";
/** Fired on `window` with `detail: ImportBatchEvent`. */
export const IMPORT_BATCH_EVENT = "acampa:import-batch";

let socket: WebSocket | null = null;
let currentToken: string | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let attempts = 0;
let onUnauthorized: ((reason: UnauthorizedReason) => void) | null = null;
/** why the server refused the session: the team's access window closed, or anything else (expired / revoked) */
export type UnauthorizedReason = "access-window-closed" | "session";
interface CollectionWaiter {
  names: Set<keyof Collections>;
  finish: () => void;
}
const collectionWaiters = new Set<CollectionWaiter>();

function clearRetry() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
}

function resolveCollectionWaiters(data: Partial<Collections>) {
  const received = new Set(Object.keys(data) as (keyof Collections)[]);
  for (const waiter of collectionWaiters) {
    if ([...waiter.names].every((name) => received.has(name))) waiter.finish();
  }
}

function open() {
  if (!currentToken) return;
  clearRetry();
  setConnection("connecting");

  const ws = new WebSocket(wsUrl(currentToken));
  socket = ws;

  ws.onopen = () => {
    attempts = 0;
    setConnection("online");
  };

  ws.onmessage = (evt) => {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(String(evt.data)) as ServerMessage;
    } catch {
      return;
    }
    if (msg.type === "snapshot" || msg.type === "update") {
      applyServerData(msg.data, msg.at);
      resolveCollectionWaiters(msg.data);
    }
    else if (msg.type === "ping") ws.send("pong");
    else if (msg.type === "import-progress") window.dispatchEvent(new CustomEvent(IMPORT_PROGRESS_EVENT, { detail: msg.data }));
    else if (msg.type === "import-batch") window.dispatchEvent(new CustomEvent(IMPORT_BATCH_EVENT, { detail: msg.data }));
    else if (msg.type === "error" && msg.code === "UNAUTHORIZED") {
      currentToken = null;
      onUnauthorized?.(/acesso da equipe/i.test(msg.message) ? "access-window-closed" : "session");
    }
  };

  ws.onclose = (evt) => {
    if (socket === ws) socket = null;
    setConnection("offline");
    if (evt.code === 4401) {
      currentToken = null;
      onUnauthorized?.(evt.reason === "access window closed" ? "access-window-closed" : "session");
      return;
    }
    scheduleRetry();
  };

  ws.onerror = () => {
    // onclose follows; nothing else to do
  };
}

function scheduleRetry() {
  if (!currentToken || retryTimer) return;
  // 1s, 2s, 4s … capped at 15s
  const delay = Math.min(15_000, 1000 * 2 ** Math.min(attempts, 4));
  attempts++;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    open();
  }, delay);
}

/** Start (or restart with a new token). */
export function connectRealtime(token: string, handlers: { onUnauthorized?: (reason: UnauthorizedReason) => void } = {}): void {
  onUnauthorized = handlers.onUnauthorized ?? null;
  if (currentToken === token && socket) return;
  disconnectRealtime();
  currentToken = token;
  attempts = 0;
  open();
}

export function disconnectRealtime(): void {
  clearRetry();
  for (const waiter of collectionWaiters) waiter.finish();
  currentToken = null;
  if (socket) {
    const s = socket;
    socket = null;
    s.onclose = null;
    s.close();
  }
  setConnection("offline");
}

/** Ask the server for a fresh full snapshot (e.g. pull-to-refresh). */
export function requestSnapshot(): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send("refresh");
  else if (currentToken && !socket) open();
}

/**
 * Register before a REST mutation so the caller can wait until its canonical
 * collections arrive through the WebSocket. A missed update triggers a full
 * snapshot request; the hard timeout prevents a successful write from hanging.
 */
export function prepareCollectionWait(names: readonly (keyof Collections)[], timeoutMs = 4000): { promise: Promise<void>; cancel: () => void } {
  let finish = () => {};
  const promise = new Promise<void>((resolve) => {
    let done = false;
    const refreshTimer = setTimeout(requestSnapshot, Math.min(1000, timeoutMs));
    const hardTimer = setTimeout(() => finish(), timeoutMs);
    const waiter: CollectionWaiter = {
      names: new Set(names),
      finish: () => {
        if (done) return;
        done = true;
        clearTimeout(refreshTimer);
        clearTimeout(hardTimer);
        collectionWaiters.delete(waiter);
        resolve();
      },
    };
    finish = waiter.finish;
    collectionWaiters.add(waiter);
  });
  return { promise, cancel: () => finish() };
}

// reconnect immediately when the device comes back online / the app returns to the foreground
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    if (currentToken && !socket) {
      clearRetry();
      attempts = 0;
      open();
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && currentToken && !socket) {
      clearRetry();
      attempts = 0;
      open();
    }
  });
}
