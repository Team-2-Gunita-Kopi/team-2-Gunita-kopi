// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { MOCK_SESSION_COOKIE, encodeMockSession } from "@gunita/auth";

function cookieFor(role: "owner_admin" | "barista") {
  const v = encodeMockSession({ userId: "u1", role, fullName: "Test", username: "test" });
  return `${MOCK_SESSION_COOKIE}=${v}`;
}

async function run(path: string, cookie: string | undefined, useMocks: boolean) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", useMocks ? "true" : "false");
  const { middleware } = await import("../src/middleware");
  return middleware(new NextRequest(`http://localhost${path}`, { headers: cookie ? { cookie } : {} }));
}

describe("pos middleware", () => {
  it("ignores the mock cookie when mocks are off", async () => {
    const res = await run("/pos", cookieFor("barista"), false);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
  });

  it("redirects to /login with the redirect param when there is no session", async () => {
    const res = await run("/pos", undefined, true);
    expect(res.headers.get("location")).toBe(`http://localhost/login?redirect=${encodeURIComponent("/pos")}`);
  });

  it("lets the right role through", async () => {
    const res = await run("/pos", cookieFor("barista"), true);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("rewrites the Owner role to /restricted", async () => {
    const res = await run("/pos", cookieFor("owner_admin"), true);
    expect(res.headers.get("x-middleware-rewrite")).toBe("http://localhost/restricted");
    expect(res.headers.get("location")).toBeNull();
  });

  it("keeps /login and /restricted public", async () => {
    for (const p of ["/login", "/restricted"]) {
      const res = await run(p, undefined, true);
      expect(res.headers.get("x-middleware-next")).toBe("1");
    }
  });
});
