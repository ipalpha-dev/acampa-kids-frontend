import { act, renderHook, waitFor } from "@testing-library/react";
import { saveAuth } from "../auth/store";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyServerData, clearStore, useCollection } from "./index";
import { NAMES_BATCH_MAX, personInfo, rememberPeople, unnamedText, useNames } from "./people";

const CAMP = { id: "c1", label: "Acampa", year: 2026, active: true };

function signIn() {
  saveAuth({ token: "tok", tokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(), user: { id: "p", personId: "p", name: "", roles: ["coordenacao"], activeRole: "coordenacao", audience: "admin", superAdmin: false }, camp: CAMP, camps: [] });
}

describe("people cache — live names joined to camp-ops records", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    act(() => clearStore());
  });

  it("joins the records pushed by the server (no names) with the cached names, live", () => {
    act(() => applyServerData({ campers: [{ id: "k1", personId: "k1", bedroom: null }] as never }, new Date().toISOString()));
    const { result } = renderHook(() => useCollection("campers"));
    expect(result.current?.[0]).toMatchObject({ id: "k1", name: "", sex: null });
    act(() => rememberPeople([{ personId: "k1", name: "Lia Souza", nickname: "Lia", sex: "F", hasHealth: true }]));
    expect(result.current?.[0]).toMatchObject({ id: "k1", name: "Lia Souza", nickname: "Lia", sex: "F", hasHealth: true });
  });

  it("asks POST /api/people/names for unknown ids in batches of ≤ 200 and never twice", async () => {
    signIn();
    const bodies: string[][] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const ids = JSON.parse(String(init?.body)).personIds as string[];
      bodies.push(ids);
      return Response.json({ items: ids.filter((id) => id !== "hidden").map((id) => ({ personId: id, name: `Nome ${id}`, nickname: null, sex: null })) });
    }));
    const ids = Array.from({ length: 250 }, (_, i) => `p${i}`).concat("hidden");
    const { result, rerender } = renderHook(() => useNames(ids));
    await waitFor(() => expect(result.current("p249")).toBe("Nome p249"));
    expect(bodies.map((b) => b.length)).toEqual([NAMES_BATCH_MAX, 51]);
    expect(result.current("hidden")).toBe("");
    expect(unnamedText("hidden")).toBe("Nome indisponível no momento");
    expect(unnamedText("not-asked-yet")).toBe("Carregando nome…");
    rerender();
    expect(bodies).toHaveLength(2);
    expect(personInfo("p0")?.name).toBe("Nome p0");
  });
});
