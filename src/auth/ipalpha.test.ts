import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_MESSAGE_TYPE, awaitPopupMessage, completeIpalpha, exactOrigin, type PopupOutcome } from "./ipalpha";

const AUTH = "https://auth.example.test";

/** A real Window (jsdom MessageEvent only accepts Window sources) standing in for the popup. */
function fakePopup(): Window {
  const frame = document.createElement("iframe");
  document.body.appendChild(frame);
  return frame.contentWindow!;
}

function post(data: unknown, origin: string, source: Window) {
  window.dispatchEvent(new MessageEvent("message", { data, origin, source }));
}

/** Resolves with the outcome, or "pending" when nothing settled the wait yet. */
async function settle(p: Promise<PopupOutcome>): Promise<PopupOutcome | "pending"> {
  return Promise.race([p, new Promise<"pending">((r) => setTimeout(() => r("pending"), 20))]);
}

describe("awaitPopupMessage", () => {
  let popup: Window;
  beforeEach(() => {
    popup = fakePopup();
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("accepts the hand-off from the auth origin, the opened popup and the expected state", async () => {
    const wait = awaitPopupMessage({ authOrigin: AUTH, popup, state: "s-1" });
    post({ type: AUTH_MESSAGE_TYPE, state: "s-1", code: "c-1" }, AUTH, popup);
    expect(await wait).toEqual({ kind: "code", code: "c-1", state: "s-1" });
  });

  it("ignores another origin, another window, another state and foreign message types", async () => {
    const wait = awaitPopupMessage({ authOrigin: AUTH, popup, state: "s-1" });
    post({ type: AUTH_MESSAGE_TYPE, state: "s-1", code: "evil" }, "https://evil.example.test", popup);
    post({ type: AUTH_MESSAGE_TYPE, state: "s-1", code: "evil" }, AUTH, window);
    post({ type: AUTH_MESSAGE_TYPE, state: "other", code: "evil" }, AUTH, popup);
    post({ type: "ipalpha:onetap", state: "s-1", code: "evil" }, AUTH, popup);
    post({ type: AUTH_MESSAGE_TYPE, state: "s-1" }, AUTH, popup);
    expect(await settle(wait)).toBe("pending");

    post({ type: AUTH_MESSAGE_TYPE, state: "s-1", code: "good" }, AUTH, popup);
    expect(await wait).toEqual({ kind: "code", code: "good", state: "s-1" });
  });

  it("forwards the hand-off state when the backend did not share one (the backend checks it)", async () => {
    const wait = awaitPopupMessage({ authOrigin: AUTH, popup });
    post({ type: AUTH_MESSAGE_TYPE, state: "server-state", code: "c-2" }, AUTH, popup);
    expect(await wait).toEqual({ kind: "code", code: "c-2", state: "server-state" });
  });

  it("maps access_denied to a gentle 'denied' outcome", async () => {
    const wait = awaitPopupMessage({ authOrigin: AUTH, popup, state: "s-1" });
    post({ type: AUTH_MESSAGE_TYPE, state: "s-1", error: "access_denied" }, AUTH, popup);
    expect(await wait).toEqual({ kind: "denied" });
  });

  it("reports a closed popup", async () => {
    const closing = { closed: false } as unknown as Window;
    const wait = awaitPopupMessage({ authOrigin: AUTH, popup: closing, pollMs: 5 });
    (closing as unknown as { closed: boolean }).closed = true;
    expect(await wait).toEqual({ kind: "closed" });
  });
});

describe("completeIpalpha", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends the device locale with the code and state, like the SMS-code verify", async () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["de-DE"]);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await completeIpalpha("the-code", "the-state");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/api/auth/ipalpha/complete");
    expect(JSON.parse(String(init.body))).toEqual({ code: "the-code", state: "the-state", locale: "de" });
  });
});

describe("exactOrigin", () => {
  it("keeps only http(s) origins", () => {
    expect(exactOrigin("https://auth.example.test/one-tap?x=1")).toBe(AUTH);
    expect(exactOrigin("javascript:alert(1)")).toBeNull();
    expect(exactOrigin("")).toBeNull();
  });
});
