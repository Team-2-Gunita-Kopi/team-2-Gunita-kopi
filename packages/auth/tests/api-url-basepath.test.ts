import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createSessionHandlers, resolveApiUrl } from "../src/session-server";
import { createAuthMiddleware } from "../src/middleware";

const base = {
  supabaseUrl: "http://supabase.local",
  supabaseKey: "publishable-key",
  cookieName: "sb-test-auth",
  proxySecret: "s".repeat(32),
  allowedRoles: ["barista"] as const,
};

afterEach(() => vi.restoreAllMocks());

describe("resolveApiUrl", () => {
  // Why: on Vercel the API address is the private binding API_URL. A missing value in production
  // must not silently fall back to localhost.
  it("uses API_URL, never a localhost default in production", () => {
    expect(resolveApiUrl({ NODE_ENV: "production", API_URL: "https://api.internal" })).toBe("https://api.internal");
    expect(resolveApiUrl({ NODE_ENV: "production", API_URL: "https://api.internal/" })).toBe("https://api.internal");
    expect(resolveApiUrl({ NODE_ENV: "production" })).toBe("");
    expect(resolveApiUrl({ NODE_ENV: "development" })).toBe("http://localhost:3002");
  });
});

describe("session handlers without an API address", () => {
  it("fail loudly and call nothing", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const h = createSessionHandlers({ ...base, allowedRoles: ["barista"], apiUrl: "" });

    const login = await h.login(
      new NextRequest("http://pos.local/auth/login", {
        method: "POST",
        headers: { origin: "http://pos.local" },
        body: "{}",
      }),
    );
    expect(login.status).toBe(503);

    const proxied = await h.proxy(new NextRequest("http://pos.local/api/orders"), {
      params: Promise.resolve({ path: ["orders"] }),
    });
    expect(proxied.status).toBe(502);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(log.mock.calls.filter(([m]) => String(m).includes("auth.api_url_missing"))).toHaveLength(2);
  });
});

describe("auth middleware under a basePath", () => {
  // Why: the POS lives at /staff on the shared domain. Sending a signed-out barista to "/login"
  // would land them on the Owner's sign-in page.
  it("redirects to the site's own login and keeps the page to return to", async () => {
    const guard = createAuthMiddleware({ ...base, allowedRoles: ["barista"], publicPaths: ["/login"] });
    const res = await guard(
      new NextRequest("http://shop.local/staff/orders", { nextConfig: { basePath: "/staff" } }),
    );
    expect(res.headers.get("location")).toBe("http://shop.local/staff/login?redirect=%2Forders");
  });
});
