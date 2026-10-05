import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Page } from "../api/people";
import { fetchAllPages, usePagedList } from "./usePagedList";

/** n items split in pages of `size`, cursor = next offset. */
function pager(n: number, size: number, tag = "") {
  const calls: (string | null)[] = [];
  const fetchPage = vi.fn(async (cursor: string | null): Promise<Page<string>> => {
    calls.push(cursor);
    const from = cursor ? Number(cursor) : 0;
    const items = Array.from({ length: Math.min(size, n - from) }, (_, i) => `${tag}${from + i}`);
    const next = from + size < n ? String(from + size) : null;
    return { items, nextCursor: next, total: n };
  });
  return { fetchPage, calls };
}

describe("usePagedList — background paging, one continuous list", () => {
  it("fetches every page in order and exposes them as one list", async () => {
    const { fetchPage, calls } = pager(5, 2);
    const { result } = renderHook(() => usePagedList("all", fetchPage));
    await waitFor(() => expect(result.current.done).toBe(true));
    expect(result.current.items).toEqual(["0", "1", "2", "3", "4"]);
    expect(result.current.total).toBe(5);
    expect(calls).toEqual([null, "2", "4"]);
    expect(result.current.loading).toBe(false);
  });

  it("shows the first page before the rest arrive", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const fetchPage = vi.fn(async (cursor: string | null): Promise<Page<string>> => {
      if (cursor) await gate;
      return cursor ? { items: ["b"], nextCursor: null } : { items: ["a"], nextCursor: "1" };
    });
    const { result } = renderHook(() => usePagedList("k", fetchPage));
    await waitFor(() => expect(result.current.items).toEqual(["a"]));
    expect(result.current.done).toBe(false);
    await act(async () => release());
    await waitFor(() => expect(result.current.items).toEqual(["a", "b"]));
  });

  it("a new key (another filter) starts over and drops the old pages", async () => {
    const a = pager(3, 1, "a");
    const b = pager(2, 1, "b");
    const { result, rerender } = renderHook(({ k }) => usePagedList(k, k === "a" ? a.fetchPage : b.fetchPage), { initialProps: { k: "a" } });
    await waitFor(() => expect(result.current.done).toBe(true));
    rerender({ k: "b" });
    await waitFor(() => expect(result.current.items).toEqual(["b0", "b1"]));
    expect(result.current.items.some((x) => x.startsWith("a"))).toBe(false);
  });

  it("null key fetches nothing; errors stop gracefully; reload starts over", async () => {
    const idle = pager(2, 1);
    const { result: paused } = renderHook(() => usePagedList(null, idle.fetchPage));
    expect(paused.current.items).toEqual([]);
    expect(idle.fetchPage).not.toHaveBeenCalled();

    let fail = true;
    const flaky = vi.fn(async (): Promise<Page<string>> => {
      if (fail) throw new Error("offline");
      return { items: ["ok"], nextCursor: null };
    });
    const { result } = renderHook(() => usePagedList("x", flaky));
    await waitFor(() => expect(result.current.error).toBe("offline"));
    fail = false;
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.items).toEqual(["ok"]));
    expect(result.current.error).toBeNull();
  });

  it("never loops on a repeated cursor; fetchAllPages feeds each page and can be stopped", async () => {
    const looping = vi.fn(async (): Promise<Page<string>> => ({ items: ["x"], nextCursor: "same" }));
    const { result } = renderHook(() => usePagedList("loop", looping));
    await waitFor(() => expect(result.current.done).toBe(true));
    expect(looping).toHaveBeenCalledTimes(2);

    const { fetchPage } = pager(6, 2);
    const seen: string[][] = [];
    let alive = true;
    await fetchAllPages(fetchPage, (items) => {
      seen.push(items);
      if (seen.length === 2) alive = false;
    }, () => alive);
    expect(seen).toEqual([["0", "1"], ["2", "3"]]);
  });
});
