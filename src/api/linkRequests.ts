import { api } from "./client";
import { bearer } from "../auth/store";

/**
 * Another responsável for a kid (decision 80, CONTRACTS §25): the coordenação
 * proposes, ONE current responsável accepts or declines. Nothing is shared until
 * then. Names arrive only for the family's own screen — never stored on the device.
 */
export interface LinkRequestPerson {
  name: string;
  nickname: string | null;
  sex: "female" | "male" | null;
}

export interface LinkRequest {
  id: string;
  childId: string;
  proposedResponsibleId: string;
  projectName: string;
  status: "pending" | "accepted" | "declined" | "expired" | "cancelled";
  createdAt: string | null;
  expiresAt: string | null;
  child: LinkRequestPerson | null;
  proposedResponsible: LinkRequestPerson | null;
}

const json = (token: string) => ({ ...bearer(token), "content-type": "application/json" });

/** coordenação: registers (or finds by phone) the person — no link yet — and asks the family */
export async function proposeLinkRequest(token: string, input: { camperId: string; name: string; phone: string; email?: string }): Promise<{ request: { id: string; childId: string; status: string; expiresAt: string | null }; responsible: { personId: string; created: boolean } }> {
  return api("/api/link-requests", { method: "POST", headers: json(token), body: JSON.stringify(input) });
}

/** responsável: pending requests for their kids */
export async function fetchMyLinkRequests(token: string): Promise<LinkRequest[]> {
  const res = await api<{ items: LinkRequest[] }>("/api/link-requests/mine", { headers: bearer(token) });
  return res.items;
}

export async function decideLinkRequest(token: string, id: string, decision: "accept" | "decline"): Promise<{ request: { id: string; childId: string; status: string } }> {
  return api(`/api/link-requests/${encodeURIComponent(id)}/${decision}`, { method: "POST", headers: json(token), body: "{}" });
}
