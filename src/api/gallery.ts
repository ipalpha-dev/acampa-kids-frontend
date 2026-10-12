import { ApiError, OFFLINE_MESSAGE, api, signalAuthFailure } from "./client";
import { bearer } from "../auth/store";

/**
 * The camp album (photos-api, through Acampa's proxy — backend routes/gallery.ts). The browser never holds an IPAlpha
 * token: every call carries the Acampa session, the backend calls photos-api with the acting role's token and streams
 * the bytes. Photo bytes are fetched with the session (an <img> cannot send it) and shown as object URLs that live in
 * memory for this session only (./photoBytes.ts) — never in the HTTP cache, the service worker or storage.
 */

// In production the API is served by the same origin through the /api Ingress.
const BASE = import.meta.env.VITE_API_URL || window.location.origin;

/** A moment of the album; `scheduleEntryId` = it follows that programme moment (photos land on it by camera time). */
export interface GalleryEvent {
  id: string;
  name: string;
  span: { start: string; end: string } | null;
  scheduleEntryId: string | null;
}

export interface GalleryAlbum {
  id: string;
  name: string;
  icon: string;
  published: boolean;
  /** false: the album exists but this role cannot read it yet (photos-api: unpublished albums are church staff only) */
  readable: boolean;
  events: GalleryEvent[];
}

export interface GalleryState {
  /** null = the edition has no album yet */
  album: GalleryAlbum | null;
  canManage: boolean;
  /** false = the camp's edition does not exist in IPAlpha yet */
  edition: boolean;
}

/** One photo: ids, placement and camera time — never faces, never who is in it. */
export interface GalleryPhoto {
  id: string;
  eventId: string | null;
  placement: "event" | "unsorted" | "album";
  takenAt: string | null;
  createdAt: string | null;
  contentType: string;
  bytes: number;
  thumbUrl: string;
  mediumUrl: string;
  originalUrl: string;
}

/** What the realtime snapshot carries for the album: its id and a change stamp (refetch when it moves). */
export interface GalleryStamp {
  albumId: string | null;
  version: number;
}

const json = (token: string, method: string, body?: unknown): RequestInit => ({ method, headers: bearer(token), ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

export function fetchGallery(token: string): Promise<GalleryState> {
  return api<GalleryState>("/api/gallery", { headers: bearer(token) });
}

export function fetchGalleryPhotos(token: string): Promise<{ photos: GalleryPhoto[]; readable: boolean; truncated: boolean }> {
  return api("/api/gallery/photos", { headers: bearer(token) });
}

/** The edition's album: `from` / `until` are São Paulo days ("YYYY-MM-DD"). */
export async function createAlbum(token: string, input: { from: string; until: string; publish: boolean }): Promise<GalleryAlbum> {
  return (await api<{ album: GalleryAlbum }>("/api/gallery/album", json(token, "POST", input))).album;
}

export async function updateAlbum(token: string, patch: { published?: boolean; name?: string }): Promise<GalleryAlbum> {
  return (await api<{ album: GalleryAlbum }>("/api/gallery/album", json(token, "PATCH", patch))).album;
}

export async function createGalleryEvent(token: string, input: { name: string; scheduleEntryId?: string }): Promise<GalleryEvent> {
  return (await api<{ event: GalleryEvent }>("/api/gallery/events", json(token, "POST", input))).event;
}

/** One album moment per programme moment not linked yet: only those the families see (default), or all of them. */
export function eventsFromProgramme(token: string, only: "parents" | "all"): Promise<{ created: number; skipped: number; alreadyLinked: number }> {
  return api("/api/gallery/events/from-programme", json(token, "POST", { only }));
}

export async function updateGalleryEvent(token: string, id: string, input: { name: string; scheduleEntryId?: string | null }): Promise<GalleryEvent> {
  return (await api<{ event: GalleryEvent }>(`/api/gallery/events/${encodeURIComponent(id)}`, json(token, "PATCH", input))).event;
}

export async function deleteGalleryEvent(token: string, id: string): Promise<void> {
  await api(`/api/gallery/events/${encodeURIComponent(id)}`, json(token, "DELETE"));
}

/** Moves photos onto a moment (null = back to "to sort"). */
export async function movePhotos(token: string, ids: string[], eventId: string | null): Promise<number> {
  return (await api<{ count: number }>("/api/gallery/photos/move", json(token, "POST", { ids, eventId }))).count;
}

export async function deletePhotos(token: string, ids: string[]): Promise<number> {
  return (await api<{ count: number }>("/api/gallery/photos/delete", json(token, "POST", { ids }))).count;
}

/** A responsável's own child: the photos where they appear (only children whose family agreed are ever recognised). */
export function fetchKidPhotos(token: string, personId: string): Promise<{ photos: GalleryPhoto[]; truncated: boolean }> {
  return api(`/api/gallery/kids/${encodeURIComponent(personId)}/photos`, { headers: bearer(token) });
}

// ── import (photos-api takes ≤ 50 files of ≤ 25 MB; Acampa streams each batch through) ──

export const PHOTO_MAX_BYTES = 25 * 1024 * 1024;
export const BATCH_MAX_FILES = 50;
/** the backend refuses a request body over 120 MB: stay well under it */
export const BATCH_MAX_BYTES = 90 * 1024 * 1024;
export const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** The picked files in upload batches; files photos-api would refuse (type / size) come back apart, untouched. */
export function planBatches(files: File[]): { batches: File[][]; refused: File[] } {
  const batches: File[][] = [];
  const refused: File[] = [];
  let current: File[] = [];
  let size = 0;
  for (const file of files) {
    if (!PHOTO_TYPES.has(file.type) || file.size > PHOTO_MAX_BYTES || file.size === 0) {
      refused.push(file);
      continue;
    }
    if (current.length > 0 && (current.length >= BATCH_MAX_FILES || size + file.size > BATCH_MAX_BYTES)) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(file);
    size += file.size;
  }
  if (current.length > 0) batches.push(current);
  return { batches, refused };
}

function deviceZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";
  } catch {
    return "America/Sao_Paulo";
  }
}

/** One batch of originals: camera time places each photo on its moment; the rest wait in "to sort". */
export async function importBatch(token: string, files: File[], signal?: AbortSignal): Promise<GalleryPhoto[]> {
  const form = new FormData();
  for (const file of files) form.append("files", file, file.name);
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/gallery/import?zone=${encodeURIComponent(deviceZone())}`, { method: "POST", headers: bearer(token), body: form, signal });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err;
    throw new ApiError(0, "OFFLINE", OFFLINE_MESSAGE);
  }
  const data = (await res.json().catch(() => null)) as { photos?: GalleryPhoto[]; error?: { code?: string; message?: string; reason?: string } } | null;
  if (!res.ok || !data?.photos) {
    if (!res.ok) signalAuthFailure(res.status, data?.error?.code ?? "");
    throw new ApiError(res.status, data?.error?.code ?? "UPLOAD_FAILED", data?.error?.message ?? "Não foi possível enviar as fotos.", { reason: data?.error?.reason });
  }
  return data.photos;
}

/** Makes a "/api/…" path absolute (the API may live on another host). */
export function galleryUrl(relative: string): string {
  return relative.startsWith("/api/") ? `${BASE}${relative}` : relative;
}

// ── .zip albums (unpacked on the device; the pictures inside go up as they are) ──

const ZIP_TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
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
