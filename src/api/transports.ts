import { command } from "./client";
import { bearer } from "../auth/store";
import { ICONS } from "../icons";

export const TRANSPORT_KINDS = ["bus", "car"] as const;
export type TransportKind = (typeof TRANSPORT_KINDS)[number];

export const TRANSPORT_KIND_META: Record<TransportKind, { label: string; icon?: string }> = {
  bus: { label: "Ônibus", icon: ICONS.transport },
  car: { label: "Carro" },
};

/**
 * The named bus colours (mirrors the server). The name PREFIXES the bus label
 * ("Ônibus Azul 2") and the hex tints the bus logo.
 */
export const BUS_COLORS = [
  // `key` names the swatch class (styles.scss `$bus-colors` — keep the hex values in sync)
  { key: "verde", name: "Verde", hex: "#0f9a8a" },
  { key: "laranja", name: "Laranja", hex: "#f2843b" },
  { key: "amarelo", name: "Amarelo", hex: "#f4c430" },
  { key: "vermelho", name: "Vermelho", hex: "#e8503a" },
  { key: "azul", name: "Azul", hex: "#3b6ff2" },
  { key: "roxo", name: "Roxo", hex: "#7d3bf2" },
  { key: "verde-escuro", name: "Verde-escuro", hex: "#2fae60" },
  { key: "cinza", name: "Cinza", hex: "#444b52" },
] as const;

/** The name of a bus colour ("Azul"), or null for a custom / unknown hex. */
export function busColorName(hex: string | null | undefined): string | null {
  if (!hex) return null;
  const h = hex.toLowerCase();
  return BUS_COLORS.find((c) => c.hex === h)?.name ?? null;
}

export interface Transport {
  id: string;
  kind: TransportKind;
  /** cars only (buses have no name) */
  name: string | null;
  /** buses only */
  color: string | null;
  /** buses only */
  number: string | null;
  /** buses only: number of seats, null when not informed */
  capacity: number | null;
  /** display label the server derives: "Ônibus 2" for a bus, the name for a car */
  label: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface TransportInput {
  kind: TransportKind;
  /** cars only */
  name?: string;
  color?: string;
  number?: string;
  /** buses only: number of seats; null / omitted clears it */
  capacity?: number | null;
}

/**
 * A bus has no name: its label is the number then the colour — "Ônibus 3 -
 * Amarelo". A car shows its free-text name. Mirrors the server.
 */
export function transportLabel(t: Pick<Transport, "kind" | "name" | "number" | "color">): string {
  if (t.kind !== "bus") return t.name?.trim() || "Carro";
  const head = ["Ônibus", t.number].filter(Boolean).join(" ").trim();
  const colour = busColorName(t.color);
  return colour ? `${head} - ${colour}` : head;
}

/**
 * The label for LISTS (my kids, campers, staff…), where several vehicles are
 * on screen at once and the coloured logo already tells them apart: "Ônibus 3"
 * without the colour. Cars keep their name.
 */
export function transportShortLabel(t: Pick<Transport, "kind" | "name" | "number">): string {
  if (t.kind !== "bus") return t.name?.trim() || "Carro";
  return ["Ônibus", t.number].filter(Boolean).join(" ").trim();
}

const json = (token: string) => ({ ...bearer(token), "content-type": "application/json" });

export async function createTransport(token: string, input: TransportInput): Promise<Transport> {
  const res = await command<{ transport: Transport }>("/api/transports", {
    method: "POST",
    headers: json(token),
    body: JSON.stringify(input),
  }, ["transports"]);
  return res.transport;
}

export async function updateTransport(token: string, id: string, patch: Partial<TransportInput>): Promise<Transport> {
  const res = await command<{ transport: Transport }>(`/api/transports/${id}`, {
    method: "PUT",
    headers: json(token),
    body: JSON.stringify(patch),
  }, ["transports"]);
  return res.transport;
}

export async function deleteTransport(token: string, id: string): Promise<void> {
  await command(`/api/transports/${id}`, { method: "DELETE", headers: bearer(token) }, ["transports"]);
}
