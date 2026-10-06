import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAuth, loadAuth, saveAuth } from "../auth/store";
import type { Prescription } from "../api/medications";
import { applyServerData, endOfflineSession, getState, setConnection, setOfflineBackend } from "../store";
import { peopleSnapshot } from "../store/people";
import { usePrescriptionsSync } from "./useMedicationDay";

const paging = vi.hoisted(() => ({ completion: null as Promise<void> | null }));
vi.mock("./usePagedList", async (original) => {
  const actual = await original<typeof import("./usePagedList")>();
  return {
    ...actual,
    fetchAllPages: async (...args: Parameters<typeof actual.fetchAllPages>) => {
      await actual.fetchAllPages(...args);
      if (paging.completion) await paging.completion;
    },
  };
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

const prescription = (personId: string): Prescription => ({
  personId, name: `Synthetic ${personId}`,
  medications: [{ name: "Synthetic medicine", dose: "1", times: ["08:00"], asNeeded: false, notes: "" }],
  allergies: ["synthetic-allergy"], healthIssues: ["synthetic-condition"],
});
const OLD = prescription("old");
const CURRENT = prescription("current");

function signIn(token = "tok", role: "saude" | "coordenacao" = "saude", campId = "c1") {
  saveAuth({ token, tokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
    user: { id: "me", personId: "me", name: "", roles: ["saude", "coordenacao"], activeRole: role, audience: "staff", superAdmin: false },
    camp: { id: campId, label: "Synthetic camp", year: 2026, active: true }, camps: [] });
}

const pending: ReturnType<typeof deferred<Response>>[] = [];
let fetchMock: ReturnType<typeof vi.fn>;
async function respond(index: number, items: Prescription[], nextCursor: string | null = null) {
  await act(async () => { pending[index].resolve(Response.json({ items, nextCursor })); });
}

async function switchScope(change: string) {
  await act(async () => {
    await endOfflineSession();
    if (change === "logout") clearAuth();
    else {
      signIn(change === "session" ? "new-token" : "tok", change === "role" ? "coordenacao" : "saude", change === "camp" ? "c2" : "c1");
      setConnection("online");
    }
  });
}

describe("prescription sync session scope", () => {
  beforeEach(async () => {
    setOfflineBackend({ read: async () => null, write: async () => {}, wipe: async () => {} });
    await endOfflineSession();
    pending.length = 0;
    paging.completion = null;
    fetchMock = vi.fn(() => {
      const response = deferred<Response>();
      pending.push(response);
      return response.promise;
    });
    vi.stubGlobal("fetch", fetchMock);
    signIn();
    act(() => setConnection("online"));
  });
  afterEach(async () => {
    await act(async () => { await endOfflineSession(); });
    vi.unstubAllGlobals();
  });

  it("pages names and health normally, sharing one flight across current-scope consumers", async () => {
    renderHook(() => usePrescriptionsSync("tok"));
    renderHook(() => usePrescriptionsSync("tok"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await respond(0, [OLD], "page2");
    expect(peopleSnapshot()).toMatchObject([{ personId: "old", name: OLD.name }]);
    expect(getState().data.prescriptions).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await respond(1, [CURRENT]);
    expect(getState().data.prescriptions).toEqual([OLD, CURRENT]);
    expect(peopleSnapshot()).toHaveLength(2);
  });

  for (const change of ["logout", "role", "camp", "session"]) {
    for (const laterPage of [false, true]) {
      it(`discards a deferred ${laterPage ? "later" : "first"} page after ${change}`, async () => {
        const hook = renderHook(() => usePrescriptionsSync(loadAuth()?.token ?? "tok"));
        if (laterPage) await respond(0, [OLD], "page2");
        const staleIndex = laterPage ? 1 : 0;
        await switchScope(change);
        hook.rerender();
        const callsBeforeStale = fetchMock.mock.calls.length;
        if (change !== "logout") expect(callsBeforeStale).toBe(staleIndex + 2);
        await respond(staleIndex, [OLD], "must-not-fetch");
        expect(fetchMock).toHaveBeenCalledTimes(callsBeforeStale);
        expect(peopleSnapshot()).toEqual([]);
        expect(getState().data.prescriptions).toBeUndefined();
        if (change !== "logout") {
          // An old flight settling must not release the current flight's singleflight slot.
          renderHook(() => usePrescriptionsSync(loadAuth()!.token));
          expect(fetchMock).toHaveBeenCalledTimes(callsBeforeStale);
          await respond(staleIndex + 1, [CURRENT]);
          expect(getState().data.prescriptions).toEqual([CURRENT]);
          expect(peopleSnapshot()).toMatchObject([{ personId: "current", name: CURRENT.name }]);
        }
      });
    }

    it(`discards completion after ${change}, even when the last page was already accepted`, async () => {
      const completion = deferred<void>();
      paging.completion = completion.promise;
      renderHook(() => usePrescriptionsSync("tok"));
      await respond(0, [OLD]);
      expect(peopleSnapshot()).toHaveLength(1);
      await switchScope(change);
      if (change !== "logout") act(() => applyServerData({ prescriptions: [CURRENT] }, "current-sync"));
      await act(async () => { completion.resolve(); });
      expect(peopleSnapshot()).toEqual([]);
      expect(getState().data.prescriptions).toEqual(change === "logout" ? undefined : [CURRENT]);
      expect(getState().syncedAt).toBe(change === "logout" ? null : "current-sync");
      if (pending[1]) await respond(1, [CURRENT]);
    });
  }

  it("discards the old epoch even when a new scope reuses the same token, role and camp", async () => {
    renderHook(() => usePrescriptionsSync("tok"));
    await act(async () => {
      await endOfflineSession();
      signIn();
      setConnection("online");
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await respond(1, [CURRENT]);
    await respond(0, [OLD], "must-not-fetch");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(getState().data.prescriptions).toEqual([CURRENT]);
    expect(peopleSnapshot()).toMatchObject([{ personId: "current", name: CURRENT.name }]);
  });

  it("rejects a response when the authenticated role changes before the store teardown", async () => {
    renderHook(() => usePrescriptionsSync("tok"));
    signIn("tok", "coordenacao");
    await respond(0, [OLD], "must-not-fetch");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(peopleSnapshot()).toEqual([]);
    expect(getState().data.prescriptions).toBeUndefined();
  });
});
