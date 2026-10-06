import { api, command } from "./client";
import { bearer } from "../auth/store";
import { ICONS } from "../icons";

export const BEDROOM_GROUPS = ["girls", "boys", "staff"] as const;
export type BedroomGroup = (typeof BEDROOM_GROUPS)[number];

/** Room picker order: the kid's wing first (boy → meninos, girl → meninas); without one, the probable gender. */
export function bedroomGroupsForSex(sex: "F" | "M" | null | undefined, probable?: "F" | "M" | null | undefined): readonly BedroomGroup[] {
  const g = sex ?? probable;
  if (g === "M") return ["boys", "girls", "staff"];
  if (g === "F") return ["girls", "boys", "staff"];
  return BEDROOM_GROUPS;
}

/** Paper-cut image (`icon`) and head-only chip (`face`). */
export const GROUP_META: Record<BedroomGroup, { label: string; icon?: string; face?: string; color: string }> = {
  girls: { label: "Meninas", icon: ICONS.girls, face: ICONS.girlFace, color: "pink" },
  boys: { label: "Meninos", icon: ICONS.boys, face: ICONS.boyFace, color: "blue" },
  staff: { label: "Equipe", icon: ICONS.staff, color: "green" },
};

export interface Bedroom {
  id: string;
  name: string;
  group: BedroomGroup;
  bunkBeds: number;
  singleBeds: number;
  capacity: number;
  occupied: number;
  occupiedStaff: number;
  occupiedCampers: number;
  available: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface BedroomInput {
  name: string;
  group: BedroomGroup;
  bunkBeds: number;
  singleBeds: number;
  notes: string;
}

/** "Meninas - 103" — plain-text label (search, exports, print, native <select>). UI chips use <BedroomTag>. */
export function bedroomLabel(b: Pick<Bedroom, "name" | "group">): string {
  return `${GROUP_META[b.group].label} - ${b.name}`;
}

const json = (token: string) => ({ ...bearer(token), "content-type": "application/json" });

export interface BedroomDetail {
  bedroom: Bedroom;
  campers: import("./campers").Camper[];
  staff: import("./staff").Staff[];
}

export async function createBedroom(token: string, input: BedroomInput): Promise<Bedroom> {
  const res = await command<{ bedroom: Bedroom }>("/api/bedrooms", {
    method: "POST",
    headers: json(token),
    body: JSON.stringify(input),
  }, ["bedrooms"]);
  return res.bedroom;
}

export async function updateBedroom(token: string, id: string, patch: Partial<BedroomInput>): Promise<Bedroom> {
  const res = await command<{ bedroom: Bedroom }>(`/api/bedrooms/${id}`, {
    method: "PUT",
    headers: json(token),
    body: JSON.stringify(patch),
  }, ["bedrooms"]);
  return res.bedroom;
}

export async function deleteBedroom(token: string, id: string): Promise<void> {
  await command(`/api/bedrooms/${id}`, { method: "DELETE", headers: bearer(token) }, ["bedrooms"]);
}

/** The whole "montar quartos" delta, applied by Concluir in one shot (POST /api/bedrooms/apply). */
export interface RoomsApplyInput {
  staff: { id: string; bedroom: string | null; roomRole: import("./staff").RoomRole }[];
  campers: { id: string; bedroom: string | null; caretakerId: string | null }[];
}

/**
 * Applies every room placement at once — staff rooms + roles, kids' rooms +
 * líderes. Texts each person concerned with one SMS about their change, unless
 * `notify` is false (the admin turned the avisos off for this apply).
 */
export async function applyRooms(token: string, input: RoomsApplyInput, notify = true): Promise<{ applied: { staff: number; campers: number } }> {
  return command("/api/bedrooms/apply", { method: "POST", headers: json(token), body: JSON.stringify({ ...input, notify }) }, ["staff", "bedrooms", "campers"]);
}

/** One team member who would be texted by an apply, and the exact SMS they'd get. */
export interface RoomsAppliedMessage {
  /** the team member (person id — name read live) */
  staffId: string;
  /** template keys + variables of each SMS */
  messages: { key: string; variables: Record<string, string | number> }[];
  /** the rendered text (pt-BR) */
  text: string;
}

/**
 * Dry-run the apply: who would be texted and the exact SMS each would receive.
 * Read-only — nothing is written. Mirrors the server's real notification gates.
 */
export async function previewRooms(token: string, input: RoomsApplyInput): Promise<{ messages: RoomsAppliedMessage[]; smsEnabled: boolean }> {
  return api("/api/bedrooms/apply/preview", { method: "POST", headers: json(token), body: JSON.stringify(input) });
}
