import { afterEach, describe, expect, it, vi } from "vitest";
import { aiTranscribe } from "./ai";
import { SESSION_ENDED_EVENT } from "./client";
import { uploadImage } from "./files";

/** Every request answers 401 SESSION_ENDED (core revoked the role token). */
function stub401() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ error: { code: "SESSION_ENDED", message: "Sua sessão terminou." } }), { status: 401 })),
  );
}

function listenSessionEnded() {
  const seen: string[] = [];
  const onEnded = (e: Event) => seen.push((e as CustomEvent<{ code: string }>).detail.code);
  window.addEventListener(SESSION_ENDED_EVENT, onEnded);
  return { seen, stop: () => window.removeEventListener(SESSION_ENDED_EVENT, onEnded) };
}

describe("multipart uploads (outside the JSON client) end the session on 401 like api() does", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("editor image upload (POST /api/files) → SESSION_ENDED", async () => {
    stub401();
    const ev = listenSessionEnded();
    const gif = new File([new Uint8Array([71, 73, 70])], "a.gif", { type: "image/gif" });
    await expect(uploadImage("tok", gif)).rejects.toMatchObject({ status: 401, code: "SESSION_ENDED" });
    expect(ev.seen).toEqual(["SESSION_ENDED"]);
    ev.stop();
  });

  it("AI voice upload (POST /api/ai/transcribe) → SESSION_ENDED", async () => {
    stub401();
    const ev = listenSessionEnded();
    await expect(aiTranscribe("tok", new Blob(["x"]))).rejects.toMatchObject({ status: 401 });
    expect(ev.seen).toEqual(["SESSION_ENDED"]);
    ev.stop();
  });
});
