import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** A 32-byte key, base64 — what GET /api/auth/offline-key answers. */
function keyB64(seed: number): string {
  return btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, i) => (i * 7 + seed) % 256)));
}

interface KeyAnswer {
  key: string;
  role: string;
  healthAllowed: boolean;
  sessionExpiresAt: string;
  campEndsAt: string | null;
}

const future = (ms: number) => new Date(Date.now() + ms).toISOString();
const DAY = 24 * 3600 * 1000;

function stubKey(answer: KeyAnswer | (() => KeyAnswer) | "offline") {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input), window.location.origin).pathname;
    if (path !== "/api/auth/offline-key") return new Response("{}", { status: 404 });
    if (answer === "offline") throw new TypeError("network down");
    const body = typeof answer === "function" ? answer() : answer;
    return new Response(JSON.stringify({ alg: "AES-GCM", ...body }), { status: 200, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Fresh store module (+ in-memory backend) per test: the module keeps the key in memory. */
async function freshStore() {
  vi.resetModules();
  const store = await import("./index");
  const offline = await import("./offline");
  const people = await import("./people");
  const backend = offline.memoryBackend();
  store.setOfflineBackend(backend);
  return { store, backend, people };
}

const KID = { id: "p-kid", personId: "p-kid", bedroom: "b1", health: { allergies: ["a1"] }, hasHealth: true };

describe("encrypted offline copy (decision 35)", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("drops the old plain-text roster snapshot from localStorage", async () => {
    localStorage.setItem("acampa.data.v1", JSON.stringify({ campers: [{ id: "x", name: "Ana" }] }));
    localStorage.setItem("acampa.data.meta", "{}");
    await freshStore();
    expect(localStorage.getItem("acampa.data.v1")).toBeNull();
    expect(localStorage.getItem("acampa.data.meta")).toBeNull();
  });

  it("writes the copy encrypted with the session key — never plain text, never the key", async () => {
    const { store, backend, people } = await freshStore();
    stubKey({ key: keyB64(1), role: "saude", healthAllowed: true, sessionExpiresAt: future(DAY), campEndsAt: future(3 * DAY) });
    await store.startOfflineSession("tok", "camp-1");
    people.rememberPeople([{ personId: "p-kid", name: "Ana Beatriz", nickname: null, sex: "F" }]);
    store.applyServerData({ campers: [KID] as never }, new Date().toISOString());
    await vi.waitFor(() => expect(backend.peek()).not.toBeNull());
    const rec = backend.peek()!;
    const bytes = new TextDecoder().decode(new Uint8Array(rec.data));
    expect(bytes).not.toContain("Ana Beatriz");
    expect(bytes).not.toContain("p-kid");
    expect(JSON.stringify(rec.meta)).not.toContain(keyB64(1));
    expect(rec.meta).toMatchObject({ role: "saude", campId: "camp-1" });
    expect(localStorage.length).toBe(0);
  });

  it("reads the copy back with the same session key (offline reopening of the same session)", async () => {
    const first = await freshStore();
    const answer = { key: keyB64(2), role: "equipe", healthAllowed: false, sessionExpiresAt: future(DAY), campEndsAt: null };
    stubKey(answer);
    await first.store.startOfflineSession("tok", "camp-1");
    first.people.rememberPeople([{ personId: "p-kid", name: "Ana", nickname: null, sex: "F" }]);
    first.store.applyServerData({ campers: [{ id: "p-kid", personId: "p-kid", bedroom: "b1" }] as never }, "2026-10-01T10:00:00.000Z");
    await vi.waitFor(() => expect(first.backend.peek()).not.toBeNull());
    const saved = first.backend.peek()!;

    const second = await freshStore();
    await second.backend.write(saved);
    stubKey(answer);
    await second.store.startOfflineSession("tok", "camp-1");
    expect(second.store.getState().data.campers).toEqual([{ id: "p-kid", personId: "p-kid", bedroom: "b1" }]);
    expect(second.people.personInfo("p-kid")?.name).toBe("Ana");
  });

  it("keeps health only for saúde / coordenação (healthAllowed)", async () => {
    const team = await freshStore();
    stubKey({ key: keyB64(3), role: "equipe", healthAllowed: false, sessionExpiresAt: future(DAY), campEndsAt: null });
    await team.store.startOfflineSession("tok", "camp-1");
    team.store.applyServerData({ campers: [KID] as never, medications: [{ id: "dose" }] as never }, new Date().toISOString());
    await vi.waitFor(() => expect(team.backend.peek()).not.toBeNull());
    const key = await (await import("./offline")).importOfflineKey(keyB64(3));
    const rec = team.backend.peek()!;
    const opened = await (await import("./offline")).decryptJson<{ data: { campers: object[]; medications: object[] } }>(key, rec.iv, rec.data);
    expect(opened!.data.campers[0]).not.toHaveProperty("health");
    expect(opened!.data.campers[0]).not.toHaveProperty("hasHealth");
    expect(opened!.data.medications).toEqual([]);

    const care = await freshStore();
    stubKey({ key: keyB64(4), role: "saude", healthAllowed: true, sessionExpiresAt: future(DAY), campEndsAt: null });
    await care.store.startOfflineSession("tok", "camp-1");
    care.store.applyServerData({ campers: [KID] as never }, new Date().toISOString());
    await vi.waitFor(() => expect(care.backend.peek()).not.toBeNull());
    const k2 = await (await import("./offline")).importOfflineKey(keyB64(4));
    const r2 = care.backend.peek()!;
    const o2 = await (await import("./offline")).decryptJson<{ data: { campers: object[] } }>(k2, r2.iv, r2.data);
    expect(o2!.data.campers[0]).toHaveProperty("health");
  });

  it("wipes on logout / role switch / 401 (endOfflineSession): copy deleted, key forgotten, memory emptied", async () => {
    const { store, backend } = await freshStore();
    stubKey({ key: keyB64(5), role: "equipe", healthAllowed: false, sessionExpiresAt: future(DAY), campEndsAt: null });
    await store.startOfflineSession("tok", "camp-1");
    store.applyServerData({ campers: [KID] as never }, new Date().toISOString());
    await vi.waitFor(() => expect(backend.peek()).not.toBeNull());
    await store.endOfflineSession();
    expect(backend.peek()).toBeNull();
    expect(store.offlineCopyActive()).toBe(false);
    expect(store.getState().data).toEqual({});
  });

  it("wipes a copy of another role or camp (a switch never reads the previous scope)", async () => {
    const first = await freshStore();
    stubKey({ key: keyB64(6), role: "saude", healthAllowed: true, sessionExpiresAt: future(DAY), campEndsAt: null });
    await first.store.startOfflineSession("tok", "camp-1");
    first.store.applyServerData({ campers: [KID] as never }, new Date().toISOString());
    await vi.waitFor(() => expect(first.backend.peek()).not.toBeNull());
    const saved = first.backend.peek()!;

    const second = await freshStore();
    await second.backend.write(saved);
    stubKey({ key: keyB64(6), role: "equipe", healthAllowed: false, sessionExpiresAt: future(DAY), campEndsAt: null });
    await second.store.startOfflineSession("tok", "camp-1");
    expect(second.store.getState().data.campers).toBeUndefined();
    expect(second.backend.peek()).toBeNull();
  });

  it("wipes a copy the new session key cannot open (key rotated)", async () => {
    const first = await freshStore();
    stubKey({ key: keyB64(7), role: "equipe", healthAllowed: false, sessionExpiresAt: future(DAY), campEndsAt: null });
    await first.store.startOfflineSession("tok", "camp-1");
    first.store.applyServerData({ campers: [KID] as never }, new Date().toISOString());
    await vi.waitFor(() => expect(first.backend.peek()).not.toBeNull());
    const saved = first.backend.peek()!;

    const second = await freshStore();
    await second.backend.write(saved);
    stubKey({ key: keyB64(8), role: "equipe", healthAllowed: false, sessionExpiresAt: future(DAY), campEndsAt: null });
    await second.store.startOfflineSession("tok", "camp-1");
    expect(second.store.getState().data.campers).toBeUndefined();
  });

  it("keeps nothing once the camp is over (campEndsAt passed)", async () => {
    const { store, backend } = await freshStore();
    await backend.write({ iv: new Uint8Array(12), data: new ArrayBuffer(8), meta: { role: "equipe", campId: "camp-1", sessionExpiresAt: future(DAY), campEndsAt: future(-1000), savedAt: "" } });
    stubKey({ key: keyB64(9), role: "equipe", healthAllowed: false, sessionExpiresAt: future(DAY), campEndsAt: future(-1000) });
    await store.startOfflineSession("tok", "camp-1");
    expect(backend.peek()).toBeNull();
    expect(store.offlineCopyActive()).toBe(false);
    store.applyServerData({ campers: [KID] as never }, new Date().toISOString());
    await new Promise((r) => setTimeout(r, 300));
    expect(backend.peek()).toBeNull();
  });

  it("wipes by itself when the session expires while the app is open", async () => {
    const { store, backend } = await freshStore();
    stubKey({ key: keyB64(10), role: "equipe", healthAllowed: false, sessionExpiresAt: future(400), campEndsAt: null });
    await store.startOfflineSession("tok", "camp-1");
    store.applyServerData({ campers: [KID] as never }, new Date().toISOString());
    await vi.waitFor(() => expect(backend.peek()).not.toBeNull());
    await vi.waitFor(() => expect(backend.peek()).toBeNull(), { timeout: 2000 });
    expect(store.offlineCopyActive()).toBe(false);
  });

  it("without network the key can't be fetched: nothing is written, the sealed copy stays", async () => {
    const { store, backend } = await freshStore();
    const sealed = { iv: new Uint8Array(12), data: new ArrayBuffer(8), meta: { role: "equipe", campId: "camp-1", sessionExpiresAt: future(DAY), campEndsAt: null, savedAt: "" } };
    await backend.write(sealed);
    stubKey("offline");
    await store.startOfflineSession("tok", "camp-1");
    expect(store.offlineCopyActive()).toBe(false);
    expect(backend.peek()).toBe(sealed);
  });
  it("endSession clears the service worker's upload / photo caches (and only those)", async () => {
    const { store } = await freshStore();
    const deleted: string[] = [];
    vi.stubGlobal("caches", { delete: vi.fn(async (name: string) => (deleted.push(name), true)) });
    await store.endOfflineSession();
    expect(deleted.sort()).toEqual(["acampa-files", "acampa-thumbs"]);
  });

  it("a camp that is over clears the upload / photo caches too", async () => {
    const { store } = await freshStore();
    const deleted: string[] = [];
    vi.stubGlobal("caches", { delete: vi.fn(async (name: string) => (deleted.push(name), true)) });
    stubKey({ key: keyB64(11), role: "equipe", healthAllowed: false, sessionExpiresAt: future(DAY), campEndsAt: future(-1000) });
    await store.startOfflineSession("tok", "camp-1");
    expect(deleted.sort()).toEqual(["acampa-files", "acampa-thumbs"]);
  });
});
