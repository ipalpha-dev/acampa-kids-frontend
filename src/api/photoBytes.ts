import { ApiError, OFFLINE_MESSAGE, signalAuthFailure } from "./client";
import { bearer } from "../auth/store";
import { galleryUrl } from "./gallery";

/**
 * Album bytes for the screen. The variants need the session (an <img> cannot send it), so they are fetched with it and
 * shown as object URLs kept in MEMORY only: never the HTTP cache (`no-store` both ways), never the service worker, never
 * storage. The memory copy is bounded and dropped with the session (`clearPhotoBytes`, called on sign-out, role / camp
 * switch and any 401 through `clearSessionCaches`).
 */

const MAX_ENTRIES = 400;
const cache = new Map<string, Promise<string>>();

function revoke(url: string): void {
  try {
    URL.revokeObjectURL(url);
  } catch {
    // jsdom / old browsers: nothing to free
  }
}

async function load(token: string, path: string, signal?: AbortSignal): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch(galleryUrl(path), { headers: bearer(token), cache: "no-store", signal });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err;
    throw new ApiError(0, "OFFLINE", OFFLINE_MESSAGE);
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
    signalAuthFailure(res.status, data?.error?.code ?? "");
    throw new ApiError(res.status, data?.error?.code ?? "PHOTOS_NOT_FOUND", data?.error?.message ?? "Esta foto não está mais no álbum.");
  }
  return res.blob();
}

/** An object URL for one variant (`/api/gallery/photos/:id/:variant`), shared by every tile showing it this session. */
export function photoObjectUrl(token: string, path: string): Promise<string> {
  const hit = cache.get(path);
  if (hit) {
    // most recently used last
    cache.delete(path);
    cache.set(path, hit);
    return hit;
  }
  const pending = load(token, path).then((blob) => URL.createObjectURL(blob));
  pending.catch(() => cache.delete(path));
  cache.set(path, pending);
  while (cache.size > MAX_ENTRIES) {
    const [oldest, url] = cache.entries().next().value as [string, Promise<string>];
    cache.delete(oldest);
    void url.then(revoke, () => undefined);
  }
  return pending;
}

/** The original, as a Blob to save (not kept). */
export function photoBlob(token: string, path: string, signal?: AbortSignal): Promise<Blob> {
  return load(token, path, signal);
}

/** Forgets every photo of this session (object URLs freed). */
export function clearPhotoBytes(): void {
  for (const pending of cache.values()) void pending.then(revoke, () => undefined);
  cache.clear();
}

/** tests only */
export function photoBytesCount(): number {
  return cache.size;
}
