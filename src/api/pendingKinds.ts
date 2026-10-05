import { api } from "./client";
import { bearer } from "../auth/store";

/**
 * What the camp asks of the family about THEMSELVES that they have not confirmed yet (decision 87): a responsável
 * added by an accepted link request starts with nothing of theirs shared. Ids + kinds only — never person data.
 */
export type SharedKind = "email" | "phone" | "document" | "address" | "medical" | "school" | "emergencyContact";

export interface PendingKindsItem {
  membershipId: string;
  kind: "involved" | "own";
  personId: string;
  role: string;
  editionId: string | null;
  granted: SharedKind[];
  requested: SharedKind[];
}

export interface PendingKinds {
  editionId: string | null;
  items: PendingKindsItem[];
  /** everything confirming shares about the family member (sorted) */
  kinds: SharedKind[];
}

export async function fetchPendingKinds(token: string): Promise<PendingKinds> {
  return api<PendingKinds>("/api/pending-kinds", { headers: bearer(token), cache: "no-store" });
}

/** all-or-nothing: exactly the `kinds` shown. 409 `PENDING_CHANGED` = the list changed — show it again. */
export async function confirmPendingKinds(token: string, kinds: readonly SharedKind[]): Promise<PendingKinds & { confirmed: number }> {
  return api("/api/pending-kinds/confirm", { method: "POST", headers: { ...bearer(token), "content-type": "application/json" }, body: JSON.stringify({ kinds }) });
}
