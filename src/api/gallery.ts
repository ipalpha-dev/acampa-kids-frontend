import { ApiError, OFFLINE_MESSAGE, command } from "./client";
import { bearer } from "../auth/store";
import { shrinkImage } from "./files";

// In production the API is served by the same origin through the /api Ingress.
const BASE = import.meta.env.VITE_API_URL || window.location.origin;

/** One photo of the camp album (the shape the server serializes). */
export interface GalleryPhoto {
  id: string;
  /** relative: "/api/files/<fileId>" — resolve with `fullUrl()` before showing */
  url: string;
  /** relative: "/api/gallery/<id>/thumb" */
  thumbUrl: string;
  caption: string;
  /** sort key, biggest first (drag & drop rewrites it) */
  order: number;
  /** id of the programme event this photo belongs to; null = general photo */
  eventId: string | null;
  /** who sent it (person id — name read live) */
  byPersonId: string;
  createdAt: string;
}

/** Makes a "/api/…" src absolute (the API may live on another host). */
export function galleryUrl(relative: string): string {
  return relative.startsWith("/api/") ? `${BASE}${relative}` : relative;
}

const THUMB_EDGE = 480;

/** Small square-ish JPEG for the grid (the full image goes to `files` ≤ 1280 px). */
async function makeThumb(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new ApiError(0, "UPLOAD_FAILED", "Não foi possível abrir a imagem.");
  const scale = Math.min(1, THUMB_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new ApiError(0, "UPLOAD_FAILED", "Não foi possível abrir a imagem.");
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.72));
  if (!blob) throw new ApiError(0, "UPLOAD_FAILED", "Não foi possível abrir a imagem.");
  return blob;
}

export interface FaceSearchResult {
  matches: { photo: GalleryPhoto; similarity: number }[];
  indexedFaces: number;
  pendingPhotos: number;
}

/** The reference stays in this request only; the server returns matched gallery ids. */
export async function searchGalleryPerson(token: string, reference: File): Promise<FaceSearchResult> {
  const image = await shrinkImage(reference);
  const form = new FormData();
  const name = reference.name.replace(/\.\w+$/, "") + (image.type === "image/png" ? ".png" : ".jpg");
  form.append("reference", image, name);
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/gallery/search-person`, { method: "POST", headers: bearer(token), body: form });
  } catch {
    throw new ApiError(0, "OFFLINE", OFFLINE_MESSAGE);
  }
  const data = (await res.json().catch(() => null)) as FaceSearchResult | { error?: { code?: string; message?: string } } | null;
  if (!res.ok || !data || !("matches" in data)) {
    const error = data && "error" in data ? data.error : undefined;
    throw new ApiError(res.status, error?.code ?? "FACE_SEARCH_FAILED", error?.message ?? "Não foi possível procurar as fotos.");
  }
  return data;
}

export interface GalleryUploadInput {
  file: File;
  caption: string;
  eventId: string | null;
}

/** Sends ONE photo (full image + thumbnail) — the page loops over the picked files. */
export async function uploadGalleryPhoto(token: string, input: GalleryUploadInput): Promise<GalleryPhoto> {
  const full = await shrinkImage(input.file);
  const thumb = await makeThumb(input.file);
  const form = new FormData();
  form.append("file", full, input.file.name.replace(/\.\w+$/, "") + (full.type === "image/png" ? ".png" : ".jpg"));
  form.append("thumb", thumb, "thumb.jpg");
  form.append("caption", input.caption);
  if (input.eventId) form.append("eventId", input.eventId);

  // multipart + the canonical value arrives in the `gallery` WebSocket collection
  const { prepareCollectionWait } = await import("../store/realtime");
  const waiter = prepareCollectionWait(["gallery"]);
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/gallery`, { method: "POST", headers: bearer(token), body: form });
  } catch {
    waiter.cancel();
    throw new ApiError(0, "OFFLINE", OFFLINE_MESSAGE);
  }
  const data = (await res.json().catch(() => null)) as { photo?: GalleryPhoto; error?: { code?: string; message?: string } } | null;
  if (!res.ok || !data?.photo) {
    waiter.cancel();
    throw new ApiError(res.status, data?.error?.code ?? "UPLOAD_FAILED", data?.error?.message ?? "Não foi possível enviar a foto.");
  }
  await waiter.promise;
  return data.photo;
}

export interface GalleryPatch {
  caption?: string;
  /** "" moves the photo to "general" */
  eventId?: string | null;
}

export async function updateGalleryPhoto(token: string, id: string, patch: GalleryPatch): Promise<GalleryPhoto> {
  const res = await command<{ photo: GalleryPhoto }>(`/api/gallery/${id}`, {
    method: "PUT",
    headers: { ...bearer(token), "content-type": "application/json" },
    body: JSON.stringify(patch),
  }, ["gallery"]);
  return res.photo;
}

export async function deleteGalleryPhoto(token: string, id: string): Promise<void> {
  await command(`/api/gallery/${id}`, { method: "DELETE", headers: bearer(token) }, ["gallery"]);
}

export interface GalleryBulkPatch {
  /** "" moves the photos to "general" */
  eventId?: string | null;
}

/** Moves a whole selection to an event in ONE request. Returns how many changed. */
export async function updateGalleryPhotos(token: string, ids: string[], patch: GalleryBulkPatch): Promise<number> {
  const res = await command<{ count: number }>(
    "/api/gallery/bulk",
    { method: "PUT", headers: { ...bearer(token), "content-type": "application/json" }, body: JSON.stringify({ ids, ...patch }) },
    ["gallery"],
  );
  return res.count;
}

/** Saves the new order of ONE section (first id = shown first). */
export async function reorderGalleryPhotos(token: string, ids: string[]): Promise<number> {
  const res = await command<{ count: number }>(
    "/api/gallery/reorder",
    { method: "PUT", headers: { ...bearer(token), "content-type": "application/json" }, body: JSON.stringify({ ids }) },
    ["gallery"],
  );
  return res.count;
}

/** Deletes a whole selection in ONE request. Returns how many were removed. */
export async function deleteGalleryPhotos(token: string, ids: string[]): Promise<number> {
  const res = await command<{ count: number }>(
    "/api/gallery/bulk-delete",
    { method: "POST", headers: { ...bearer(token), "content-type": "application/json" }, body: JSON.stringify({ ids }) },
    ["gallery"],
  );
  return res.count;
}

/**
 * The album switch (settings.galleryPublished): `true` shows every photo to the
 * camp at once (the server texts the team and the parents once), `false` hides
 * the album again. Publishing is never per photo.
 */
export async function setAlbumPublished(token: string, published: boolean): Promise<number> {
  const res = await command<{ published: boolean; count: number }>(
    "/api/gallery/publish",
    { method: "PUT", headers: { ...bearer(token), "content-type": "application/json" }, body: JSON.stringify({ published }) },
    ["gallery"],
  );
  return res.count;
}

// ── .zip albums (unpacked on the device, so every photo is shrunk before upload) ──

const ZIP_TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };
/** a single zip never turns into more than this many uploads */
const ZIP_MAX_ENTRIES = 300;

export function isZip(file: File): boolean {
  return /\.zip$/i.test(file.name) || file.type === "application/zip" || file.type === "application/x-zip-compressed";
}

export function zipSupported(): boolean {
  return typeof DecompressionStream !== "undefined";
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Reads the pictures out of a .zip on the device (central directory + STORED /
 * DEFLATE entries — no dependency, `DecompressionStream` does the inflating).
 * Folders, macOS junk (`__MACOSX`, dot files) and non-images are skipped, so a
 * zip straight out of a camera or Google Photos just works.
 */
export async function extractZipImages(file: File): Promise<File[]> {
  if (!zipSupported()) throw new ApiError(0, "ZIP_UNSUPPORTED", "Este navegador não abre arquivos .zip. Atualize o app ou envie as fotos soltas.");
  const buf = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // end of central directory: scan backwards (comment is at most 64 KB)
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65_535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ApiError(0, "ZIP_INVALID", `"${file.name}" não parece um .zip válido.`);

  const entries = view.getUint16(eocd + 10, true);
  let ptr = view.getUint32(eocd + 16, true);
  const out: File[] = [];
  const decoder = new TextDecoder();

  for (let n = 0; n < entries && out.length < ZIP_MAX_ENTRIES; n++) {
    if (ptr + 46 > buf.length || view.getUint32(ptr, true) !== 0x02014b50) break;
    const method = view.getUint16(ptr + 10, true);
    const compressedSize = view.getUint32(ptr + 20, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localOffset = view.getUint32(ptr + 42, true);
    const name = decoder.decode(buf.subarray(ptr + 46, ptr + 46 + nameLen));
    ptr += 46 + nameLen + extraLen + commentLen;

    const base = name.split("/").pop() ?? "";
    if (name.endsWith("/") || !base || base.startsWith(".") || name.includes("__MACOSX")) continue;
    const type = ZIP_TYPES[base.split(".").pop()?.toLowerCase() ?? ""];
    if (!type) continue;
    if (view.getUint32(localOffset, true) !== 0x04034b50) continue;

    const dataStart = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    const raw = buf.subarray(dataStart, dataStart + compressedSize);
    let bytes: Uint8Array;
    if (method === 0) bytes = raw;
    else if (method === 8) bytes = await inflateRaw(raw).catch(() => new Uint8Array());
    else continue; // other compression methods are not used by real-world photo zips
    if (bytes.byteLength === 0) continue;
    out.push(new File([bytes as BlobPart], base, { type }));
  }
  return out;
}
