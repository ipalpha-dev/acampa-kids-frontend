import { api } from "./client";
import { bearer } from "../auth/store";

/**
 * The camp authorization on the family's screen (decision 13): what the edition requires of each child (`participante`),
 * the EXACT current text of each document, and the acceptance on the child's behalf. Ids, slugs and versions only —
 * the backend reads and writes IPAlpha with the family's own tokens and keeps nothing. There is no withdrawal here.
 */
export interface ConsentDocument {
  document: string;
  version: number;
  /** per language (pt-BR always) */
  title: Record<string, string>;
  /** the version's text, shown as plain formatted text (never as HTML) */
  markdown: string;
}

export interface ChildConsents {
  personId: string;
  /** documents still to accept for this child (empty = nothing to do) */
  pending: { document: string; version: number }[];
}

export interface CampConsents {
  editionId: string | null;
  documents: ConsentDocument[];
  children: ChildConsents[];
}

export async function fetchCampConsents(token: string): Promise<CampConsents> {
  return api<CampConsents>("/api/consents", { headers: bearer(token), cache: "no-store" });
}

/**
 * Accepts exactly the version shown, for one child. 409 `CONSENT_VERSION_CHANGED` = a new text was published — reload and
 * show it again; 409 `CONSENT_NOT_REQUIRED` = no longer asked.
 */
export async function acceptCampConsent(token: string, input: { personId: string; document: string; version: number }): Promise<{ accepted: { personId: string; document: string; version: number } }> {
  return api("/api/consents/accept", { method: "POST", headers: { ...bearer(token), "content-type": "application/json" }, body: JSON.stringify(input) });
}

/** The team's view (persons-api consent-status, read live with the acting role): per child, all required documents accepted? */
export interface ConsentStatus {
  /** false: this role may not see it — show no badge at all */
  visible: boolean;
  items: { personId: string; accepted: boolean }[];
}

export async function fetchConsentStatus(token: string): Promise<ConsentStatus> {
  return api<ConsentStatus>("/api/consents/status", { headers: bearer(token), cache: "no-store" });
}
