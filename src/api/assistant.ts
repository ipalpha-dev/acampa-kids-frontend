import { api } from "./client";
import { bearer } from "../auth/store";

/**
 * Sareca's voice session. The browser talks only to the Acampa backend, which relays to core ai-api with the
 * person's own token (BFF): no AI key, token or vendor URL ever reaches the browser — only the WebRTC audio flows
 * straight to the voice model.
 */
export interface AssistantStatus {
  /** the person may hold a spoken conversation right now (ai-api configured + Acampa approved for AI) */
  enabled: boolean;
  voiceModel: string;
}

export async function assistantStatus(token: string): Promise<AssistantStatus> {
  return api("/api/assistant/status", { headers: bearer(token) });
}

/** Trades this browser's WebRTC offer for the voice model's answer (through ai-api). */
export async function assistantLiveSession(token: string, sdp: string): Promise<{ sessionId: string; sdp: string }> {
  return api("/api/assistant/live", { method: "POST", headers: bearer(token), body: JSON.stringify({ sdp }) });
}

/** A skill answer, or `client: true` when this browser must run it (navigate_app). */
export type AssistantToolAnswer = { output: string; client?: undefined } | { client: true; name: string; arguments: string };

/** One tool call of the voice session: ai-api runs the skill (with this person's role) or hands it back. */
export async function assistantTool(token: string, call: { sessionId: string; callId: string; name: string; arguments: string }): Promise<AssistantToolAnswer> {
  return api("/api/assistant/tool", { method: "POST", headers: bearer(token), body: JSON.stringify(call) });
}

/** How long the session ran since the last report, for the person's daily voice limit. */
export async function assistantUsage(token: string, usage: { sessionId: string; seconds: number }): Promise<unknown> {
  return api("/api/assistant/usage", { method: "POST", headers: bearer(token), body: JSON.stringify(usage), keepalive: true });
}

/** One thing the person said (their own words), for the church's review in ai-api — never kept by Acampa. */
export async function assistantTurn(token: string, turn: { sessionId: string; text: string }): Promise<unknown> {
  return api("/api/assistant/turns", { method: "POST", headers: bearer(token), body: JSON.stringify(turn), keepalive: true });
}
