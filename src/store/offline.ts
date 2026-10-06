/**
 * The encrypted offline copy (decision 35, CONTRACTS_ACAMPA §15).
 *
 * The camp site has no internet, so the app keeps what the acting role may see
 * on the device — but only:
 *   - role-scoped: one copy per session + role + camp (a switch starts over);
 *   - encrypted: AES-GCM with the per-session key from `GET /api/auth/offline-key`.
 *     The key lives in memory only (a non-extractable CryptoKey) and is never
 *     persisted — a reload needs the server once to read the copy back;
 *   - short-lived: wiped on logout, role / camp switch, any 401 (session ended),
 *     when the session expires and once the camp is over (`campEndsAt`);
 *   - health only for `saude` / `coordenacao` (`healthAllowed`): every other role's
 *     copy is stripped of health before it is written.
 *
 * Storage is IndexedDB (one record); tests inject an in-memory backend.
 */

export interface OfflineMeta {
  role: string;
  campId: string;
  /** ISO — the copy is unusable (wiped) after this */
  sessionExpiresAt: string;
  /** ISO or null — the copy is wiped once the camp is over */
  campEndsAt: string | null;
  savedAt: string;
}

export interface OfflineRecord {
  meta: OfflineMeta;
  iv: Uint8Array;
  data: ArrayBuffer;
}

export interface OfflineBackend {
  read(): Promise<OfflineRecord | null>;
  write(record: OfflineRecord): Promise<void>;
  wipe(): Promise<void>;
}

const DB_NAME = "acampa-offline";
const STORE = "copy";
const KEY = "current";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest | null): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => {
          db.close();
          resolve(req ? ((req.result as T | undefined) ?? null) : null);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      }),
  );
}

/** IndexedDB backend (the browser's). */
export const indexedDbBackend: OfflineBackend = {
  read: () => run<OfflineRecord>("readonly", (s) => s.get(KEY)).catch(() => null),
  write: (record) => run("readwrite", (s) => s.put(record, KEY)).then(() => undefined),
  wipe: () =>
    run("readwrite", (s) => s.delete(KEY))
      .then(() => undefined)
      .catch(() => undefined),
};

/** In-memory backend (tests; browsers without IndexedDB keep nothing on disk). */
export function memoryBackend(): OfflineBackend & { peek(): OfflineRecord | null } {
  let record: OfflineRecord | null = null;
  return {
    read: async () => record,
    write: async (r) => {
      record = r;
    },
    wipe: async () => {
      record = null;
    },
    peek: () => record,
  };
}

export function defaultBackend(): OfflineBackend {
  return typeof indexedDB !== "undefined" ? indexedDbBackend : memoryBackend();
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Imports the server key as a NON-extractable AES-GCM key (it can never be read back or saved). */
export async function importOfflineKey(b64: string): Promise<CryptoKey> {
  const raw = base64ToBytes(b64);
  if (raw.length !== 32) throw new Error("offline key must be 32 bytes");
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptJson(key: CryptoKey, value: unknown): Promise<{ iv: Uint8Array; data: ArrayBuffer }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(value)));
  return { iv, data };
}

/** null when the key does not open the record (rotated key, tampered data). */
export async function decryptJson<T>(key: CryptoKey, iv: Uint8Array, data: ArrayBuffer): Promise<T | null> {
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
    return JSON.parse(new TextDecoder().decode(plain)) as T;
  } catch {
    return null;
  }
}

/** Is the stored copy still allowed to exist for this scope at `now`? */
export function copyIsUsable(meta: OfflineMeta, scope: { role: string; campId: string }, now = Date.now()): boolean {
  if (meta.role !== scope.role || meta.campId !== scope.campId) return false;
  if (new Date(meta.sessionExpiresAt).getTime() <= now) return false;
  if (meta.campEndsAt && new Date(meta.campEndsAt).getTime() <= now) return false;
  return true;
}

/** Health fields a non-health role's copy must never carry. */
const HEALTH_KEYS = ["health", "hasHealth"] as const;

/**
 * Removes health from a snapshot of the collections + people cache before it
 * is written for a role that may not keep health offline: the `health` /
 * `hasHealth` of every record, the medication checklist and the prescriptions.
 */
export function stripHealth<T extends Record<string, unknown>>(snapshot: T): T {
  const out: Record<string, unknown> = { ...snapshot };
  for (const [name, value] of Object.entries(out)) {
    if (name === "medications" || name === "prescriptions") {
      out[name] = [];
      continue;
    }
    if (Array.isArray(value)) {
      out[name] = value.map((item) => {
        if (!item || typeof item !== "object") return item;
        if (!HEALTH_KEYS.some((k) => k in (item as object))) return item;
        const copy = { ...(item as Record<string, unknown>) };
        for (const k of HEALTH_KEYS) delete copy[k];
        return copy;
      });
    }
  }
  return out as T;
}
