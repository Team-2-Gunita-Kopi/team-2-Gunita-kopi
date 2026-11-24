import { afterEach, describe, expect, it, vi } from "vitest";
import { BASE_PATH, withBasePath } from "@/staff/lib/base-path";
import { apiClient } from "@/staff/lib/api-client";
import manifest from "@/staff/manifest";

afterEach(() => vi.restoreAllMocks());

describe("POS under /staff", () => {
  it("prefixes root paths once and leaves full URLs alone", () => {
    expect(BASE_PATH).toBe("/staff");
    expect(withBasePath("/api/orders")).toBe("/staff/api/orders");
    expect(withBasePath("/staff/api/orders")).toBe("/staff/api/orders");
    expect(withBasePath("https://cdn.example/x.png")).toBe("https://cdn.example/x.png");
  });

  // Why: offline orders queued before the move must still reach this site's proxy, which now
  // lives at /staff/api. A bare "/api/sync" would hit the Owner site instead.
  it("sends API calls to this site's /staff proxy", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ success: true, data: null })));
    await apiClient("/api/sync", { method: "POST", body: "{}" });
    expect(fetchSpy.mock.calls[0]?.[0]).toBe("/staff/api/sync");
  });

  it("installs the PWA inside /staff", () => {
    const m = manifest();
    expect(m.start_url).toBe("/staff/pos");
    expect(m.scope).toBe("/staff/");
    expect(m.icons?.every((i) => i.src.startsWith("/staff/icons/"))).toBe(true);
  });

});
