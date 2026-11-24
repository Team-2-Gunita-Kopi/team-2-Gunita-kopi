import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { BASE_PATH, withBasePath } from "@/owner/lib/base-path";
import { apiClient } from "@/owner/lib/api-client";
import { middleware } from "@/middleware";

afterEach(() => vi.unstubAllGlobals());

describe("Owner portal under /admin", () => {
  it("prefixes root paths once and leaves full URLs alone", () => {
    expect(BASE_PATH).toBe("/admin");
    expect(withBasePath("/api/users")).toBe("/admin/api/users");
    expect(withBasePath("/admin/api/users")).toBe("/admin/api/users");
    expect(withBasePath("https://x.example/y")).toBe("https://x.example/y");
  });

  // Why: Owner calls must go to the Owner site's own proxy, which carries only the Owner cookie.
  it("sends API and sign-in calls to this site's /admin routes", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ success: true, data: null })));
    await apiClient("/api/users");
    await apiClient("/auth/login", { method: "POST", body: "{}" });
    expect(fetchSpy.mock.calls.map((c) => c[0])).toEqual(["/admin/api/users", "/admin/auth/login"]);
  });

  // Why: a signed-out visitor must land on the Owner sign-in at /admin/login, never a POS page.
  it("sends a signed-out visitor to /admin/login and remembers the page", async () => {
    const res = await middleware(new NextRequest("http://shop.local/admin/users"));
    expect(res.headers.get("location")).toBe("http://shop.local/admin/login?redirect=%2Fadmin%2Fusers");
  });
});

describe("Owner product photos", () => {
  // Why: stored photos are served by the private backend through /admin/api; a bare /api/... path
  // is not a public route, so thumbnails and the edit preview would be broken.
  it("load through the Owner area's proxy", async () => {
    const { ownerImageSrc } = await import("@/owner/features/products/image");
    const p = { id: 12, image: "12/11111111-2222-4333-8444-555555555555.webp" } as never;
    expect(ownerImageSrc(p)).toBe("/admin/api/products/12/image?v=11111111-2222-4333-8444-555555555555.webp");
    expect(ownerImageSrc({ id: 12, image: "https://cdn.example/x.png" } as never)).toBe("https://cdn.example/x.png");
    expect(ownerImageSrc({ id: 12, image: null } as never)).toBeUndefined();
  });
});
