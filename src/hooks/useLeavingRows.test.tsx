import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLeavingRows } from "./useLeavingRows";

interface Row {
  id: string;
}
const byId = (rows: Row[]) => rows.slice().sort((a, b) => a.id.localeCompare(b.id));
const states = (rows: { id: string; rowState: string }[]) => rows.map((r) => `${r.id}:${r.rowState}`);

describe("useLeavingRows", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("animates nothing on the first load, marks added rows as entering and keeps removed ones leaving until the timer ends", () => {
    const { result, rerender } = renderHook(({ list }: { list: Row[] | null }) => useLeavingRows(list, byId, 200), { initialProps: { list: null as Row[] | null } });
    expect(result.current).toEqual([]);
    rerender({ list: [{ id: "a" }, { id: "b" }] });
    expect(states(result.current)).toEqual(["a:stay", "b:stay"]);

    rerender({ list: [{ id: "a" }, { id: "b" }, { id: "c" }] });
    expect(states(result.current)).toEqual(["a:stay", "b:stay", "c:enter"]);
    act(() => void vi.advanceTimersByTime(200));
    expect(states(result.current)).toEqual(["a:stay", "b:stay", "c:stay"]);

    rerender({ list: [{ id: "a" }, { id: "c" }] });
    expect(states(result.current)).toEqual(["a:stay", "b:leave", "c:stay"]);
    act(() => void vi.advanceTimersByTime(200));
    expect(states(result.current)).toEqual(["a:stay", "c:stay"]);
  });

  it("with reduced motion rows just appear and disappear", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce"), addEventListener() {}, removeEventListener() {} }));
    const { result, rerender } = renderHook(({ list }: { list: Row[] }) => useLeavingRows(list, byId, 200), { initialProps: { list: [{ id: "a" }, { id: "b" }] } });
    rerender({ list: [{ id: "a" }, { id: "c" }] });
    expect(states(result.current)).toEqual(["a:stay", "c:stay"]);
  });
});
