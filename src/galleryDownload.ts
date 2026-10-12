/**
 * Taking the camp album home.
 *
 * On a computer every picked photo goes into ONE .zip (folders named after the
 * programme events); on a phone a .zip is useless, so the pictures are saved
 * one after another straight into the gallery / downloads.
 *
 * The .zip is written by hand (STORED entries — JPEGs don't shrink any
 * further), the same way `api/gallery.ts` reads an uploaded .zip by hand: no
 * dependency, and the browser keeps the bytes in a Blob instead of the heap.
 */
import { isMobile } from "./pwa/install";
import { photoBlob } from "./api/photoBytes";

export interface DownloadItem {
  /** the original's path (`/api/gallery/photos/:id/original`) — fetched with the session, never cached */
  url: string;
  /** folder inside the .zip ("" = the zip's root) — ignored on phones */
  folder: string;
  /** file name WITHOUT extension (the real one comes from the response type) */
  name: string;
  /** the photo's date, used as the file's timestamp inside the .zip */
  createdAt: string;
}

export interface DownloadProgress {
  done: number;
  total: number;
  /** photos the server did not give back (the rest still downloads) */
  failed: number;
  /** true once every picture is in and the .zip is being closed */
  zipping: boolean;
}

export interface DownloadOptions {
  /** aborting it stops the run between (and during) photos */
  signal: AbortSignal;
  onProgress: (p: DownloadProgress) => void;
  /** file name of the .zip (computers only) */
  zipName: string;
  /** the Acampa session (the album bytes are proxied with it) */
  token: string;
}

/** A computer gets one .zip; a phone gets the photos one by one. */
export function zipsDownloads(): boolean {
  return !isMobile();
}

// ── file names ─────────────────────────────────────────────────────────────

/** Turns a caption into something every operating system accepts as a name. */
export function safeName(raw: string, fallback: string): string {
  const clean = raw
    .normalize("NFC")
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.+$/, "")
    .slice(0, 60)
    .trim();
  return clean || fallback;
}

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

function extOf(type: string): string {
  return EXT[type] ?? "jpg";
}

/** "Evento/003-legenda.jpg", never twice the same inside one .zip */
function uniquePath(used: Set<string>, item: DownloadItem, ext: string): string {
  const base = item.folder ? `${item.folder}/${item.name}` : item.name;
  let path = `${base}.${ext}`;
  for (let n = 2; used.has(path); n++) path = `${base} (${n}).${ext}`;
  used.add(path);
  return path;
}

// ── plumbing ───────────────────────────────────────────────────────────────

function abortError(): DOMException {
  return new DOMException("Download interrompido.", "AbortError");
}

export function isAbort(err: unknown): boolean {
  return !!err && typeof err === "object" && (err as { name?: string }).name === "AbortError";
}

function stopIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError();
}

/** with the session, never from / into the HTTP cache (a child's photo is not kept beyond the screen) */
function fetchPhoto(url: string, signal: AbortSignal, token: string): Promise<Blob> {
  return photoBlob(token, url, signal);
}

/** Hands a blob to the browser as a download (the object url is freed later). */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Safari still reads the url while the download starts: let it finish first
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

// ── zip (STORED entries + central directory) ───────────────────────────────

let CRC_TABLE: Uint32Array | null = null;

function crcTable(): Uint32Array {
  if (CRC_TABLE) return CRC_TABLE;
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  CRC_TABLE = t;
  return t;
}

function crc32(bytes: Uint8Array): number {
  const t = crcTable();
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** MS-DOS date/time pair — what a .zip stores instead of a real timestamp. */
function dosStamp(iso: string): { time: number; date: number } {
  const parsed = new Date(iso);
  const d = Number.isNaN(parsed.getTime()) || parsed.getFullYear() < 1980 ? new Date() : parsed;
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/** a zip without ZIP64 cannot go past these — an album never comes close */
const ZIP_MAX_BYTES = 0xffffffff;
const ZIP_MAX_ENTRIES = 0xffff;

async function buildZip(items: DownloadItem[], opts: DownloadOptions): Promise<Blob> {
  const encoder = new TextEncoder();
  const parts: BlobPart[] = [];
  const central: Uint8Array[] = [];
  const used = new Set<string>();
  let offset = 0;
  let done = 0;
  let failed = 0;

  for (const item of items) {
    stopIfAborted(opts.signal);
    let blob: Blob | null = null;
    try {
      blob = await fetchPhoto(item.url, opts.signal, opts.token);
    } catch (err) {
      if (isAbort(err)) throw err;
      failed++;
    }

    if (blob) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const size = bytes.length;
      const path = uniquePath(used, item, extOf(blob.type));
      const nameBytes = encoder.encode(path);
      const crc = crc32(bytes);
      const { time, date } = dosStamp(item.createdAt);

      const local = new Uint8Array(30 + nameBytes.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true); // version needed
      lv.setUint16(6, 0x0800, true); // names are UTF-8
      lv.setUint16(8, 0, true); // stored: a JPEG does not deflate
      lv.setUint16(10, time, true);
      lv.setUint16(12, date, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, size, true);
      lv.setUint32(22, size, true);
      lv.setUint16(26, nameBytes.length, true);
      local.set(nameBytes, 30);

      const dir = new Uint8Array(46 + nameBytes.length);
      const dv = new DataView(dir.buffer);
      dv.setUint32(0, 0x02014b50, true);
      dv.setUint16(4, 20, true); // version made by
      dv.setUint16(6, 20, true); // version needed
      dv.setUint16(8, 0x0800, true);
      dv.setUint16(10, 0, true);
      dv.setUint16(12, time, true);
      dv.setUint16(14, date, true);
      dv.setUint32(16, crc, true);
      dv.setUint32(20, size, true);
      dv.setUint32(24, size, true);
      dv.setUint16(28, nameBytes.length, true);
      dv.setUint32(42, offset, true); // where the local header sits
      dir.set(nameBytes, 46);

      // the bytes go straight into a Blob so the JS heap can drop them again
      parts.push(local as BlobPart, new Blob([bytes as BlobPart]));
      central.push(dir);
      offset += local.length + size;
      if (offset > ZIP_MAX_BYTES || central.length > ZIP_MAX_ENTRIES) {
        throw new Error("São fotos demais para um único arquivo. Baixe por evento.");
      }
    }

    done++;
    opts.onProgress({ done, total: items.length, failed, zipping: false });
  }

  if (central.length === 0) throw new Error("Nenhuma foto pôde ser baixada.");
  opts.onProgress({ done, total: items.length, failed, zipping: true });

  const cdOffset = offset;
  let cdSize = 0;
  for (const dir of central) {
    parts.push(dir as BlobPart);
    cdSize += dir.length;
  }
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, central.length, true);
  ev.setUint16(10, central.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, cdOffset, true);
  parts.push(end as BlobPart);

  return new Blob(parts, { type: "application/zip" });
}

// ── one by one (phones) ────────────────────────────────────────────────────

/** a phone needs a breath between downloads or it drops the next one */
const STEP_PAUSE_MS = 400;

async function downloadEachFile(items: DownloadItem[], opts: DownloadOptions): Promise<void> {
  const used = new Set<string>();
  let done = 0;
  let failed = 0;
  for (const item of items) {
    stopIfAborted(opts.signal);
    try {
      const blob = await fetchPhoto(item.url, opts.signal, opts.token);
      // no folders on a phone: the event name becomes part of the file name
      const flat: DownloadItem = { ...item, name: item.folder ? `${item.folder} - ${item.name}` : item.name, folder: "" };
      saveBlob(blob, uniquePath(used, flat, extOf(blob.type)));
    } catch (err) {
      if (isAbort(err)) throw err;
      failed++;
    }
    done++;
    opts.onProgress({ done, total: items.length, failed, zipping: false });
    if (done < items.length) await sleep(STEP_PAUSE_MS, opts.signal);
  }
  if (failed === items.length) throw new Error("Nenhuma foto pôde ser baixada.");
}

/**
 * Downloads the photos: one .zip on a computer, file by file on a phone.
 * Aborting `opts.signal` stops the run — what already landed stays.
 */
export async function downloadPhotos(items: DownloadItem[], opts: DownloadOptions): Promise<void> {
  if (items.length === 0) return;
  if (!zipsDownloads()) return downloadEachFile(items, opts);
  const zip = await buildZip(items, opts);
  saveBlob(zip, opts.zipName);
}
