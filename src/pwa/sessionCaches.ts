/**
 * Service-worker runtime caches that hold what people uploaded (editor files,
 * photo-album thumbnails). They belong to the session that saw them: logout,
 * role / camp switch, any 401 (SESSION_ENDED) and the end of the camp delete
 * them (see `endOfflineSession` in ../store). Names mirror `runtimeCaching`
 * in vite.config.ts. The app shell precache is not touched (no person data).
 */
export const SESSION_CACHE_NAMES = ["acampa-files", "acampa-thumbs"] as const;

/** Deletes the upload / gallery caches from the page (Cache Storage is shared with the worker). Never throws. */
export async function clearSessionCaches(): Promise<void> {
  if (typeof caches === "undefined") return;
  await Promise.all(SESSION_CACHE_NAMES.map((name) => caches.delete(name).catch(() => false)));
}
