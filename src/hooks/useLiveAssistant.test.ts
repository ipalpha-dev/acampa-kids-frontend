import { afterEach, describe, expect, it, vi } from "vitest";
import { assistantTool, assistantTurn, assistantUsage } from "../api/assistant";
import { toolOutputOf } from "./useLiveAssistant";

/** Sareca through the Acampa backend (→ core ai-api): tool answers, client skills, usage and the person's words. */

afterEach(() => vi.restoreAllMocks());

function mockFetch(body: unknown) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
}

describe("tool answers", () => {
  it("a skill answer goes back to the model as is", () => {
    expect(toolOutputOf({ output: '{"bedrooms":[]}' })).toBe('{"bedrooms":[]}');
  });

  it("{client:true} navigate_app runs in this browser (bare or app-prefixed name)", () => {
    const onNavigate = vi.fn(() => '{"ok":true}');
    expect(toolOutputOf({ client: true, name: "acampa-kids__navigate_app", arguments: '{"destination":"bedrooms"}' }, onNavigate)).toBe('{"ok":true}');
    expect(onNavigate).toHaveBeenCalledWith('{"destination":"bedrooms"}');
    expect(toolOutputOf({ client: true, name: "navigate_app", arguments: "{}" }, onNavigate)).toBe('{"ok":true}');
  });

  it("any other client skill is refused here (nothing but navigation runs in the browser)", () => {
    const onNavigate = vi.fn(() => "x");
    expect(JSON.parse(toolOutputOf({ client: true, name: "forms__fill_form", arguments: "{}" }, onNavigate)).error).toBeTruthy();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("the tool call carries the live session id and the call id to the backend only", async () => {
    const fetch = mockFetch({ output: "{}" });
    await assistantTool("session-token", { sessionId: "live-1", callId: "c1", name: "acampa-kids__bedrooms", arguments: "{}" });
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/assistant\/tool$/);
    expect(JSON.parse(String(init.body))).toEqual({ sessionId: "live-1", callId: "c1", name: "acampa-kids__bedrooms", arguments: "{}" });
  });
});

describe("usage and turns", () => {
  it("usage and the person's words are relayed to the Acampa backend (kept alive on page close)", async () => {
    const fetch = mockFetch({ ok: true });
    await assistantUsage("t", { sessionId: "live-1", seconds: 60 });
    await assistantTurn("t", { sessionId: "live-1", text: "quem falta chegar?" });
    const [usageUrl, usageInit] = fetch.mock.calls[0] as [string, RequestInit];
    const [turnUrl, turnInit] = fetch.mock.calls[1] as [string, RequestInit];
    expect(usageUrl).toMatch(/\/api\/assistant\/usage$/);
    expect(usageInit.keepalive).toBe(true);
    expect(JSON.parse(String(usageInit.body))).toEqual({ sessionId: "live-1", seconds: 60 });
    expect(turnUrl).toMatch(/\/api\/assistant\/turns$/);
    expect(JSON.parse(String(turnInit.body))).toEqual({ sessionId: "live-1", text: "quem falta chegar?" });
  });
});
