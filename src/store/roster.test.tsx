import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveAuth } from "../auth/store";
import { applyServerData, clearStore, setConnection, useCollection } from "./index";
import { resetRosterNames } from "./roster";

const CAMP = { id: "c1", label: "Acampa", year: 2026, active: true };
const rec = (id: string) => ({ id, personId: id, bedroom: null });

function signIn() {
  saveAuth({ token: "tok", tokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(), user: { id: "p", personId: "p", name: "", roles: ["coordenacao"], activeRole: "coordenacao", audience: "admin", superAdmin: false }, camp: CAMP, camps: [] });
}

/** GET /api/campers in two pages, GET /api/staff, POST /api/people/names — every call recorded. */
function stubRoster() {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), window.location.origin);
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push(`${method} ${url.pathname}${url.search}`);
    if (url.pathname === "/api/campers") {
      const second = url.searchParams.get("cursor") === "c2";
      const items = second ? [{ ...rec("k2"), name: "Bia", nickname: null, sex: "F", hasHealth: true }] : [{ ...rec("k1"), name: "Ana", nickname: null, sex: "F" }];
      return Response.json({ items, nextCursor: second ? null : "c2" });
    }
    if (url.pathname === "/api/staff") return Response.json({ items: [{ ...rec("s1"), name: "Saulo", nickname: null, sex: "M" }], nextCursor: null });
    if (url.pathname === "/api/people/names") {
      const ids = JSON.parse(String(init?.body)).personIds as string[];
      return Response.json({ items: ids.map((id) => ({ personId: id, name: `Nome ${id}`, nickname: null, sex: null })) });
    }
    return Response.json({ error: { code: "NOT_FOUND", message: "not found" } }, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

describe("roster names — only for the screen being viewed, paged on demand", () => {
  beforeEach(() => {
    signIn();
    act(() => {
      applyServerData({ campers: [rec("k1"), rec("k2")] as never, staff: [rec("s1")] as never }, new Date().toISOString());
      setConnection("online");
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    act(() => clearStore());
    resetRosterNames();
  });

  it("nothing is read until a screen shows the kids; then only the kids' list is paged (not the team)", async () => {
    const calls = stubRoster();
    // an app-wide hook reading records without names asks nothing
    renderHook(() => useCollection("staff", { names: false }));
    await new Promise((r) => setTimeout(r, 30));
    expect(calls).toEqual([]);

    const { result } = renderHook(() => useCollection("campers"));
    await waitFor(() => expect(result.current?.map((k) => k.name)).toEqual(["Ana", "Bia"]));
    expect(result.current?.[1]).toMatchObject({ hasHealth: true });
    expect(calls.filter((c) => c.startsWith("GET /api/campers"))).toHaveLength(2);
    expect(calls.some((c) => c.startsWith("GET /api/staff"))).toBe(false);
  });

  it("never re-reads the list on an offline / online flip or when the screen opens again", async () => {
    const calls = stubRoster();
    const first = renderHook(() => useCollection("campers"));
    await waitFor(() => expect(first.result.current?.[1]?.name).toBe("Bia"));
    const before = calls.length;
    act(() => setConnection("offline"));
    act(() => setConnection("online"));
    first.unmount();
    const again = renderHook(() => useCollection("campers"));
    await new Promise((r) => setTimeout(r, 50));
    expect(again.result.current?.map((k) => k.name)).toEqual(["Ana", "Bia"]);
    expect(calls.length).toBe(before);
  });

  it("a kid that arrives later is named through POST /api/people/names — the list is not paged again", async () => {
    const calls = stubRoster();
    const { result } = renderHook(() => useCollection("campers"));
    await waitFor(() => expect(result.current?.[1]?.name).toBe("Bia"));
    act(() => applyServerData({ campers: [rec("k1"), rec("k2"), rec("k3")] as never }, new Date().toISOString()));
    await waitFor(() => expect(result.current?.[2]?.name).toBe("Nome k3"));
    expect(calls.filter((c) => c.startsWith("GET /api/campers"))).toHaveLength(2);
    expect(calls.filter((c) => c.startsWith("POST /api/people/names"))).toHaveLength(1);
  });

  it("offline, nothing is read; a list that could not be paged is tried once the connection is back", async () => {
    act(() => setConnection("offline"));
    const calls = stubRoster();
    const { result } = renderHook(() => useCollection("campers"));
    await new Promise((r) => setTimeout(r, 30));
    expect(calls).toEqual([]);
    act(() => setConnection("online"));
    await waitFor(() => expect(result.current?.[0]?.name).toBe("Ana"));
  });
});
