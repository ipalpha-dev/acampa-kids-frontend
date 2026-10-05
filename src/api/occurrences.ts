import { bearer } from "../auth/store";
import { command } from "./client";

export interface Occurrence {
  id: string;
  /** person ids of the kids (names read live) */
  campers: string[];
  /** person ids of the team members (names read live) */
  staff: string[];
  /** sanitized HTML, possibly containing uploaded images */
  description: string;
  /** who registered it: person id, acting role key and the occurrence group */
  createdBy: { personId: string; role: string; group: string };
  createdAt: string;
}

export interface OccurrenceInput {
  camperIds: string[];
  staffIds: string[];
  description: string;
}

export async function createOccurrence(token: string, input: OccurrenceInput): Promise<Occurrence> {
  const response = await command<{ occurrence: Occurrence }>("/api/occurrences", {
    method: "POST",
    headers: { ...bearer(token), "content-type": "application/json" },
    body: JSON.stringify(input),
  }, ["occurrences"]);
  return response.occurrence;
}
