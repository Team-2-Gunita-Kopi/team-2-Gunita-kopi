// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { MOCK_SESSION_COOKIE, encodeMockSession } from "@/auth";

function cookieFor(role: "owner_admin" | "barista") {
  const v = encodeMockSession({ userId: "u1", role, fullName: "Test", username: "test" });
  return `${MOCK_SESSION_COOKIE}=${v}`;
}

async function run(path: string, cookie: string | undefined, useMocks: boolean) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", useMocks ? "true" : "false");
  const { middleware } = await import("@/middleware");
  return middleware(new NextRequest(`http://localhost${path}`, { headers: cookie ? { cookie } : {} }));
}

describe("admin middleware", () => {
  it("ignores the mock cookie when mocks are off", async () => {
    const res = await run("/admin/dashboard", cookieFor("owner_admin"), false);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/admin/login");
  });

  it("redirects to /login with the redirect param when there is no session", async () => {
    const res = await run("/admin/dashboard", undefined, true);
    expect(res.headers.get("location")).toBe(`http://localhost/admin/login?redirect=${encodeURIComponent("/admin/dashboard")}`);
  });

  it("lets the right role through", async () => {
    const res = await run("/admin/dashboard", cookieFor("owner_admin"), true);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("rewrites the Barista role to /restricted", async () => {
    const res = await run("/admin/dashboard", cookieFor("barista"), true);
    expect(res.headers.get("x-middleware-rewrite")).toBe("http://localhost/admin/restricted");
    expect(res.headers.get("location")).toBeNull();
  });

  it("keeps /login and /restricted public", async () => {
    for (const p of ["/admin/login", "/admin/restricted"]) {
      const res = await run(p, undefined, true);
      expect(res.headers.get("x-middleware-next")).toBe("1");
    }
  });
});
