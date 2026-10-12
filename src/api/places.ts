import { api } from "./client";
import { bearer } from "../auth/store";

/**
 * The camp venue and its places — places-api through the Acampa backend (the browser never holds IPAlpha tokens).
 * Names, beds and the structure are the church's catalog; only the camp venue and what is inside it can be added here.
 */

export type PlaceKind = "campus" | "floor" | "wing" | "sanctuary" | "kitchen" | "office" | "meeting-room" | "classroom" | "church" | "camp-venue" | "bedroom";

export interface VenueSummary {
  id: string;
  name: string;
  city: string | null;
}

/** a place inside the camp's venue (any depth); `linked` marks a bedroom the camp already uses */
export interface VenuePlace {
  id: string;
  name: string;
  kind: PlaceKind;
  parentId: string | null;
  linked?: boolean;
}

/** a place as a programme moment names it */
export interface EventPlace {
  id: string;
  name: string;
  kind: PlaceKind;
}

const json = (token: string) => ({ ...bearer(token), "content-type": "application/json" });

/** the camp venues the church knows (coordenação) + the one this camp is held at */
export async function listVenues(token: string): Promise<{ venues: VenueSummary[]; selectedId: string | null }> {
  return api("/api/places/venues", { headers: bearer(token) });
}

/** this camp's venue and every active place below it (programme editors) */
export async function getVenue(token: string): Promise<{ venue: VenueSummary | null; places: VenuePlace[] }> {
  const res = await api<{ venue: VenueSummary | null; places: VenuePlace[] }>("/api/places/venue", { headers: bearer(token) });
  return { venue: res.venue, places: res.places };
}

export async function setCampVenue(token: string, campId: string, venuePlaceId: string | null): Promise<void> {
  await api(`/api/camps/${campId}/venue`, { method: "PUT", headers: json(token), body: JSON.stringify({ venuePlaceId }) });
}

/** a new camp venue (the address is completed in Oikos) */
export async function createVenue(token: string, name: string): Promise<VenueSummary> {
  const res = await api<{ place: VenueSummary }>("/api/places", { method: "POST", headers: json(token), body: JSON.stringify({ name, kind: "camp-venue" }) });
  return res.place;
}
