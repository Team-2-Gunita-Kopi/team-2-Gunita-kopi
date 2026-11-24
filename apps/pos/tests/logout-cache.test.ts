import { afterEach, describe, expect, it, vi } from "vitest";
import { signOut } from "../src/features/auth/api";

afterEach(() => vi.unstubAllGlobals());

describe("POS sign-out on a shared tablet", () => {
  // Why: the next barista must not see cached orders or stock from the previous session, but
  // offline orders still waiting to sync (IndexedDB, not Cache Storage) must survive.
  it("drops cached API responses only", async () => {
    const del = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("caches", { delete: del });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }))));
    await signOut();
    expect(del).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith("apis");
  });
});
