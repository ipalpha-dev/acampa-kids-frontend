import { api, command } from "./client";
import { bearer } from "../auth/store";
import type { CollectionName } from "../store";

/** One block of camp data the admin wipes between two camps (Configurações → Limpeza). */
export type CleanupGroup = "campers" | "staff" | "bedrooms" | "transports" | "teams" | "schedule" | "docs" | "occurrences" | "medications" | "scores" | "gallery" | "welcomes" | "notices";

/**
 * The admin lists whose people may be SPARED when the Equipe block is wiped
 * (the toggles on the card). A kept list also stays as it is.
 */
/** camp-ops lists the Equipe cleanup may spare (helper roles live in IPAlpha) */
export type StaffKeepGroup = "busHelpers" | "parentContacts";

/** Which realtime collections the server republishes for each block — the write waits for them. */
const TOUCHES: Record<CleanupGroup | "all", CollectionName[]> = {
  campers: ["campers", "staff", "bedrooms", "scores", "medications"],
  staff: ["staff", "campers", "bedrooms", "teams", "events", "settings"],
  bedrooms: ["bedrooms", "campers", "staff"],
  transports: ["transports", "campers", "staff", "settings"],
  teams: ["teams", "campers", "staff", "scores"],
  schedule: ["events", "roles", "gallery", "scores"],
  docs: ["instructions", "preparation"],
  occurrences: ["occurrences"],
  medications: ["medications"],
  scores: ["scores"],
  gallery: ["gallery"],
  welcomes: ["staff"],
  notices: ["staff", "campers", "settings"],
  all: ["campers", "staff", "bedrooms", "transports", "teams", "events", "occurrences", "medications", "scores", "gallery", "settings"],
};

/**
 * Wipes one block (or "all"). Admin only; there is no undo.
 * `roles` only matters for the Programação block: it also deletes the funções
 * with their instruções / preparação.
 */
export async function runCleanup(
  token: string,
  group: CleanupGroup | "all",
  keep: readonly StaffKeepGroup[] = [],
  roles = false,
): Promise<Partial<Record<CleanupGroup, number>>> {
  const r = await command<{ removed: Partial<Record<CleanupGroup, number>> }>(
    `/api/cleanup/${group}`,
    { method: "POST", headers: { ...bearer(token), "content-type": "application/json" }, body: JSON.stringify({ keep, roles }) },
    TOUCHES[group],
  );
  return r.removed;
}

/** The two notification blocks count "already sent" marks, which are not in the realtime store. */
export async function fetchCleanupMarks(token: string): Promise<{ welcomes: number; notices: number }> {
  return api("/api/cleanup/marks", { headers: bearer(token) });
}

