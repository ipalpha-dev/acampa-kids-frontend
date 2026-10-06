import QRCode from "qrcode";
import { bedroomLabel, type Bedroom } from "../api/bedrooms";
import type { Camper } from "../api/campers";
import { bedSrc } from "../icons";
import styles from "../components/campers.module.scss";
import { namesFor, personInfo } from "../store/people";

/**
 * Printable labels for the kids — the **badge** (crachá, 100 × 62 mm) and the
 * **access bracelet** (pulseira, 240 × 17 mm). Both carry a QR code that opens
 * the camper's detail page (`#/campers/:id`) so a staff phone can scan it.
 *
 * Only camp operations are printed (name, team, transport, room + QR): no
 * health marks, no contacts — paper outlives the camp (decision 31).
 *
 * The page is rendered into a hidden iframe (no popup blockers, no extra
 * tab) with `@page { size }` matching the label, and printed from there.
 */

export type LabelKind = "badge" | "bracelet";

export const LABEL_META: Record<LabelKind, { title: string; emoji: string; size: string; description: string }> = {
  badge: { title: "Crachá", emoji: "🪪", size: "100 × 62 mm", description: "QR, nome, time, ônibus e quarto" },
  bracelet: { title: "Pulseira", emoji: "🎟️", size: "240 × 17 mm", description: "Pulseira de acesso com QR e nome" },
};

type LabelOf = (id: string | null | undefined) => string | null;

/** URL the QR points to — the camper's detail page in this same app */
export function camperUrl(id: string): string {
  return `${location.origin}${location.pathname}#/campers/${id}`;
}

/**
 * The camper id out of a scanned QR — accepts the app's camper-detail URL
 * (`…#/campers/:id`, as printed on the badge and bracelet) from ANY host:
 * labels printed on localhost / another domain still work, and the server
 * validates the id anyway. Anything else → null.
 */
export function camperIdFromQr(raw: string): string | null {
  const value = raw.trim();
  try {
    const url = new URL(value, location.href);
    const match = url.hash.match(/^#\/campers\/([^/?#]+)\/?(?:\?.*)?$/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

interface LabelData {
  name: string;
  team: string;
  bus: string;
  room: string;
  bed: string;
  qr: string;
}

async function labelData(k: Pick<Camper, "id" | "name" | "team" | "transportation" | "bedroom">, roomById: Map<string, Bedroom>, labelOf: LabelOf): Promise<LabelData> {
  const room = k.bedroom ? roomById.get(k.bedroom) : null;
  const qr = await QRCode.toString(camperUrl(k.id), { type: "svg", margin: 0, errorCorrectionLevel: "M" });
  return {
    name: (k.name || personInfo(k.id)?.name || "").trim(),
    team: (labelOf(k.team) ?? "").toUpperCase(),
    bus: (labelOf(k.transportation) ?? "").toUpperCase(),
    room: room ? bedroomLabel(room).toUpperCase() : "",
    bed: bedSrc(room?.group),
    qr,
  };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** long names get a smaller font so they still fit the label */
function nameSize(name: string, base: number, steps: [number, number][]): number {
  for (const [len, size] of steps) if (name.length > len) return size;
  return base;
}

const FONT_LINK = `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fredoka:wght@700&display=block">`;

const COMMON_CSS = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { font-family: 'Fredoka', 'Trebuchet MS', system-ui, sans-serif; font-weight: 700; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .card { position: relative; overflow: hidden; background: #fff; page-break-after: always; break-after: page; }
  .card:last-child { page-break-after: auto; break-after: auto; }
  .qr { position: absolute; }
  .qr svg { width: 100%; height: 100%; display: block; }
  .row { display: flex; align-items: center; gap: 0.6mm; white-space: nowrap; text-transform: uppercase; letter-spacing: 0.01em; }
  .ico { font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif; font-weight: 400; line-height: 1; }
  .ico img { width: 1.15em; height: 1.15em; object-fit: contain; display: block; }
  @media screen { body { background: #ccc; padding: 10mm; } .card { margin: 0 auto 6mm; box-shadow: 0 2px 8px rgba(0,0,0,.3); } }
`;

// ── badge · 100 × 62 mm ─────────────────────────────────────────────────

const BADGE_CSS = `
  @page { size: 100mm 62mm; margin: 0; }
  .card { width: 100mm; height: 62mm; }
  .qr { left: 4mm; top: 3.6mm; width: 28mm; height: 28mm; }
  .name { position: absolute; left: 38mm; top: 2.6mm; right: 3mm; height: 20mm; line-height: 1.08; overflow: hidden; display: flex; align-items: flex-start; }
  .row { position: absolute; left: 38mm; right: 2mm; height: 6mm; font-size: 11.4pt; }
  .row .ico { font-size: 13pt; }
  .row--team { top: 21.8mm; }
  .row--bus { top: 32.9mm; }
  .row--room { top: 44mm; font-size: 10.8pt; }
`;

function badgeHtml(d: LabelData): string {
  const size = nameSize(d.name, 19.2, [
    [38, 14],
    [26, 16.5],
  ]);
  return `<div class="card">
    <div class="qr">${d.qr}</div>
    <div class="name" style="font-size:${size}pt">${esc(d.name)}</div>
    ${d.team ? `<div class="row row--team"><span class="ico">🏷️</span><span>${esc(d.team)}</span></div>` : ""}
    ${d.bus ? `<div class="row row--bus"><span class="ico">🚌</span><span>${esc(d.bus)}</span></div>` : ""}
    ${d.room ? `<div class="row row--room"><span class="ico"><img src="${esc(d.bed)}" alt=""></span><span>${esc(d.room)}</span></div>` : ""}
  </div>`;
}

// ── bracelet · 240 × 17 mm ──────────────────────────────────────────────
// the first ~30 mm stay blank (it is the tail that closes the bracelet)

const BRACELET_CSS = `
  @page { size: 240mm 17mm; margin: 0; }
  .card { width: 240mm; height: 17mm; }
  .qr { left: 32mm; top: 1.4mm; width: 14mm; height: 14mm; }
  .name { position: absolute; left: 48mm; top: 1.3mm; width: 136mm; height: 7.5mm; line-height: 1; white-space: nowrap; overflow: hidden; display: flex; align-items: center; }
  .cols { position: absolute; left: 48mm; top: 9.6mm; height: 5mm; display: flex; align-items: center; }
  .row { font-size: 8.5pt; }
  .row .ico { font-size: 10.5pt; }
  .row--room { width: 36.6mm; }
  .row--bus { width: 46.2mm; }
  .row--team { font-size: 7.3pt; }
`;

function braceletHtml(d: LabelData): string {
  const size = nameSize(d.name, 17.4, [
    [40, 12.5],
    [32, 14.5],
  ]);
  return `<div class="card">
    <div class="qr">${d.qr}</div>
    <div class="name" style="font-size:${size}pt">${esc(d.name)}</div>
    <div class="cols">
      <div class="row row--room">${d.room ? `<span class="ico"><img src="${esc(d.bed)}" alt=""></span><span>${esc(d.room)}</span>` : ""}</div>
      <div class="row row--bus">${d.bus ? `<span class="ico">🚌</span><span>${esc(d.bus)}</span>` : ""}</div>
      <div class="row row--team">${d.team ? `<span class="ico">🏷️</span><span>${esc(d.team)}</span>` : ""}</div>
    </div>
  </div>`;
}

// ── document + printing ─────────────────────────────────────────────────

export async function buildLabelsHtml(kind: LabelKind, campers: Camper[], bedrooms: Bedroom[], labelOf: LabelOf): Promise<string> {
  const roomById = new Map(bedrooms.map((b) => [b.id, b]));
  // names arrive in the background: make sure every label has one before printing
  const unnamed = campers.filter((k) => !k.name).map((k) => k.id);
  if (unnamed.length) await namesFor(unnamed);
  const data = await Promise.all(campers.map((k) => labelData(k, roomById, labelOf)));
  const render = kind === "badge" ? badgeHtml : braceletHtml;
  const css = COMMON_CSS + (kind === "badge" ? BADGE_CSS : BRACELET_CSS);
  const title = `${LABEL_META[kind].title}s — Acampa Kids`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(title)}</title>${FONT_LINK}<style>${css}</style></head><body>${data.map(render).join("\n")}</body></html>`;
}

/** Renders the labels in a hidden iframe and opens the browser's print dialog. */
export async function printLabels(kind: LabelKind, campers: Camper[], bedrooms: Bedroom[], labelOf: LabelOf): Promise<void> {
  const html = await buildLabelsHtml(kind, campers, bedrooms, labelOf);

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.className = styles.printFrame;
  document.body.appendChild(frame);

  await new Promise<void>((resolve) => {
    frame.addEventListener("load", () => resolve(), { once: true });
    frame.srcdoc = html;
  });

  const win = frame.contentWindow;
  if (!win) {
    frame.remove();
    throw new Error("Não foi possível preparar a impressão.");
  }

  // wait for Fredoka (with a cap — printing with the fallback font beats hanging)
  const fonts = win.document.fonts;
  if (fonts) await Promise.race([fonts.ready.then(() => fonts.load("700 12pt Fredoka")), new Promise((r) => setTimeout(r, 4000))]);

  const cleanup = () => setTimeout(() => frame.remove(), 500);
  win.addEventListener("afterprint", cleanup, { once: true });
  // Safari doesn't always fire afterprint on iframes → belt and braces
  setTimeout(cleanup, 60_000);
  win.focus();
  win.print();
}
