import { ApiError, OFFLINE_MESSAGE, signalAuthFailure } from "./client";
import { bearer } from "../auth/store";

// In production the API is served by the same origin through the /api Ingress.
// VITE_API_URL is only needed when development uses a separate backend.
const BASE = import.meta.env.VITE_API_URL || window.location.origin;

export interface UploadedFile {
  id: string;
  /** relative: "/api/files/<id>" — resolve with `fileUrl()` before showing */
  url: string;
  name: string;
  type: string;
  size: number;
}

/** Makes a "/api/files/…" src absolute (the API may live on another host). */
export function fileUrl(relative: string): string {
  return relative.startsWith("/api/") ? `${BASE}${relative}` : relative;
}

/** Turns absolute API image urls back into the relative form the backend stores. */
export function relativizeFileUrls(html: string): string {
  return html.split(`${BASE}/api/files/`).join("/api/files/");
}

/** Resolves relative image urls for display. */
export function absolutizeFileUrls(html: string): string {
  return html.replace(/(src=")\/api\/files\//g, `$1${BASE}/api/files/`);
}

const MAX_EDGE = 1280;
const MAX_UPLOAD = 2 * 1024 * 1024;

/**
 * Decodes a still. `createImageBitmap` alone fails on iPhone HEIC (and on
 * JPEGs that only have an EXIF orientation), so we honour EXIF and fall back
 * to an <img> decode when the bitmap path rejects the file.
 */
async function bitmapFromFile(file: File): Promise<ImageBitmap | null> {
  const opts: ImageBitmapOptions = { imageOrientation: "from-image" };
  const direct = await createImageBitmap(file, opts).catch(() => null);
  if (direct) return direct;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode"));
      el.src = url;
    });
    return await createImageBitmap(img, opts).catch(() => null);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Shrinks a picture on the device before upload (phones shoot 4000 px JPEGs):
 * longest edge ≤ 1280 px, re-encoded as JPEG (or WebP when the source is PNG
 * with transparency… we keep it simple: PNG stays PNG, anything else → JPEG).
 */
export async function shrinkImage(file: File): Promise<Blob> {
  if (file.type === "image/gif") return file; // keep animations
  const bitmap = await bitmapFromFile(file);
  if (!bitmap) {
    throw new ApiError(0, "UPLOAD_FAILED", "Não foi possível abrir a imagem. Tire a foto pela câmera ou escolha um JPG/PNG.");
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= MAX_UPLOAD && (file.type === "image/jpeg" || file.type === "image/png" || file.type === "image/webp")) {
    bitmap.close();
    return file;
  }
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
  const type = file.type === "image/png" ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));
  if (!blob) throw new ApiError(0, "UPLOAD_FAILED", "Não foi possível abrir a imagem.");
  return blob;
}

export async function uploadImage(token: string, file: File): Promise<UploadedFile> {
  const blob = await shrinkImage(file);
  const form = new FormData();
  const name = blob === file ? file.name : file.name.replace(/\.\w+$/, "") + (blob.type === "image/png" ? ".png" : ".jpg");
  form.append("file", blob, name);
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/files`, { method: "POST", headers: bearer(token), body: form });
  } catch {
    throw new ApiError(0, "OFFLINE", OFFLINE_MESSAGE);
  }
  const data = (await res.json().catch(() => null)) as { file?: UploadedFile; error?: { code?: string; message?: string } } | null;
  if (!res.ok || !data?.file) {
    if (!res.ok) signalAuthFailure(res.status, data?.error?.code ?? "");
    throw new ApiError(res.status, data?.error?.code ?? "UPLOAD_FAILED", data?.error?.message ?? "Não foi possível enviar a imagem.");
  }
  return data.file;
}
