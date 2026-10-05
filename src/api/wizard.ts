import { command } from "./client";
import { bearer } from "../auth/store";

/** What the sample camp loaded (counts per collection). */
export interface SampleLoad {
  campers: number;
  staff: number;
  bedrooms: number;
  transports: number;
  teams: number;
}

/**
 * 🧪 Test mode: fills an EMPTY camp with the fictional sample so the whole
 * system can be tried end-to-end. The fictional people (and their
 * responsáveis) are registered in IPAlpha by the backend with the coordenação
 * sign-in; Acampa keeps only the camp ops. Coordenação only; refuses when the
 * camp already has people (clean up first).
 */
export async function loadSampleCamp(token: string): Promise<SampleLoad> {
  return command<SampleLoad>(
    "/api/wizard/sample",
    { method: "POST", headers: bearer(token) },
    ["campers", "staff", "bedrooms", "transports", "teams"],
  );
}
