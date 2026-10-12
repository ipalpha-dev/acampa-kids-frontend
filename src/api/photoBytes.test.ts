import { afterEach, describe, expect, it, vi } from "vitest";
import { clearPhotoBytes, photoBytesCount, photoObjectUrl } from "./photoBytes";
import { planBatches } from "./gallery";

describe("album bytes — fetched with the session, kept in memory for the session only", () => {
  afterEach(() => clearPhotoBytes());

  it("sends the session bearer, bypasses the HTTP cache and shares one object URL per variant", async () => {
    const fetch = vi.fn(async () => new Response(new Uint8Array([1, 2]), { status: 200, headers: { "content-type": "image/webp" } }));
    vi.stubGlobal("fetch", fetch);
    const created = vi.fn(() => "blob:one");
    const revoked = vi.fn();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: created, revokeObjectURL: revoked }));

    expect(await photoObjectUrl("tok", "/api/gallery/photos/abc/thumb")).toBe("blob:one");
    expect(await photoObjectUrl("tok", "/api/gallery/photos/abc/thumb")).toBe("blob:one");
    expect(fetch).toHaveBeenCalledTimes(1);
    const init = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.cache).toBe("no-store");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer tok");

    clearPhotoBytes();
    expect(photoBytesCount()).toBe(0);
    await Promise.resolve();
    await Promise.resolve();
    expect(revoked).toHaveBeenCalledWith("blob:one");
  });

  it("a refused photo is not remembered (the next look asks again)", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ error: { code: "PHOTOS_NOT_FOUND" } }), { status: 404 }));
    vi.stubGlobal("fetch", fetch);
    await expect(photoObjectUrl("tok", "/api/gallery/photos/gone/thumb")).rejects.toMatchObject({ code: "PHOTOS_NOT_FOUND" });
    await Promise.resolve();
    expect(photoBytesCount()).toBe(0);
  });
});

describe("planBatches — what photos-api accepts per import", () => {
  const file = (name: string, type: string, size: number) => Object.defineProperty(new File([new Uint8Array(1)], name, { type }), "size", { value: size });

  it("≤ 50 files and ≤ 90 MB per batch; other types, empty or > 25 MB files stay out", () => {
    const many = Array.from({ length: 120 }, (_, i) => file(`p${i}.jpg`, "image/jpeg", 1000));
    const { batches, refused } = planBatches([...many, file("big.jpg", "image/jpeg", 26 * 1024 * 1024), file("a.gif", "image/gif", 10), file("e.png", "image/png", 0)]);
    expect(batches.map((b) => b.length)).toEqual([50, 50, 20]);
    expect(refused.map((f) => f.name)).toEqual(["big.jpg", "a.gif", "e.png"]);
    const heavy = Array.from({ length: 6 }, (_, i) => file(`h${i}.jpg`, "image/jpeg", 20 * 1024 * 1024));
    expect(planBatches(heavy).batches.map((b) => b.length)).toEqual([4, 2]);
  });
});
