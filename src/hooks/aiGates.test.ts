import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/** D32 in the UI: only who the server lets sort / clean health text sees or triggers it (no request that would be refused). */

const auth = vi.hoisted(() => ({ role: "coordenacao" }));
vi.mock("../auth/store", async (original) => ({
  ...(await original<typeof import("../auth/store")>()),
  loadAuth: () => ({ user: { activeRole: auth.role } }),
}));

import { mayCleanFields, useFieldDedup } from "./useFieldDedup";
import { maySortNotes } from "./useAiNotesSorter";

afterEach(() => vi.restoreAllMocks());

describe("observations sorter and field clean-up gates", () => {
  it("coordenação and saúde sort and clean; the organization and plain team do not", () => {
    for (const role of ["coordenacao", "saude"]) {
      auth.role = role;
      expect(maySortNotes("camper")).toBe(true);
      expect(mayCleanFields()).toBe(true);
    }
    for (const role of ["organizacao", "equipe"]) {
      auth.role = role;
      expect(maySortNotes("camper")).toBe(false);
      expect(mayCleanFields()).toBe(false);
    }
  });

  it("a responsável sorts their own child's notes but never calls the field clean-up", async () => {
    auth.role = "responsavel";
    expect(maySortNotes("parent")).toBe(true);
    expect(maySortNotes("camper")).toBe(false);
    const fetch = vi.spyOn(globalThis, "fetch");
    const { result } = renderHook(() => useFieldDedup({ token: "t" }));
    await act(async () => {
      await result.current.run("healthNotes", "asma\nasma", () => {});
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
