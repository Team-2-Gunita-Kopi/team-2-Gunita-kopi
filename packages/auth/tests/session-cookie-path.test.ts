import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createSessionHandlers } from "../src/session-server";
import { createAuthMiddleware } from "../src/middleware";

const SUPABASE = "http://supabase.local";
const b64url = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
const exp = Math.floor(Date.now() / 1000) + 3600;
const jwt = (role: string) =>
  `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ sub: "u1", exp, role: "authenticated", app_metadata: { role } })}.sig`;
const user = (role: string) => ({
  id: "u1",
  aud: "authenticated",
  role: "authenticated",
  email: "barista@staff.gunitakopi.local",
  app_metadata: { role },
  user_metadata: { username: "barista", full_name: "Bea" },
  created_at: "2026-11-24T00:00:00Z",
});

// Supabase Auth and apps/api answer from these stubs; nothing leaves the test.
function stubNetwork(role: string) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.endsWith("/api/auth/login"))
      return Response.json({ success: true, data: { accessToken: jwt(role), refreshToken: "refresh-1" } });
    if (url.startsWith(`${SUPABASE}/auth/v1/user`)) return Response.json(user(role));
    if (url.startsWith(`${SUPABASE}/auth/v1/logout`)) return new Response(null, { status: 204 });
    throw new Error(`unexpected fetch ${url}`);
  });
}

afterEach(() => vi.restoreAllMocks());

const pos = {
  supabaseUrl: SUPABASE,
  supabaseKey: "publishable-key",
  cookieName: "sb-gunita-pos-auth",
  apiUrl: "http://api.local",
  proxySecret: "s".repeat(32),
  allowedRoles: ["barista"] as const,
  cookiePath: "/staff",
};

describe("POS session cookie under /staff", () => {
  // Why: the Admin site shares the origin. The POS session must be scoped to /staff, and a copy
  // left at "/" from before the move must be expired, or browsers keep sending the stale one.
  it("sets the session at /staff and expires a leftover / copy", async () => {
    stubNetwork("barista");
    const h = createSessionHandlers({ ...pos, allowedRoles: ["barista"] });
    const res = await h.login(
      new NextRequest("http://shop.local/staff/auth/login", {
        method: "POST",
        headers: { origin: "http://shop.local", cookie: "sb-gunita-pos-auth=stale" },
        body: JSON.stringify({ username: "barista", password: "x" }),
      }),
    );
    expect(res.status).toBe(200);
    const cookies = res.headers.getSetCookie();
    const session = cookies.filter((c) => c.startsWith("sb-gunita-pos-auth") && !c.includes("Max-Age=0"));
    expect(session.length).toBeGreaterThan(0);
    expect(session.every((c) => /;\s*Path=\/staff(;|$)/i.test(c))).toBe(true);
    expect(cookies).toContainEqual(expect.stringMatching(/^sb-gunita-pos-auth=; Path=\/; Max-Age=0/));
  });
});

describe("POS guard under /staff", () => {
  // Why: an Owner session on the POS must see the POS "restricted" notice, not an Admin page.
  it("rewrites a wrong role to /staff/restricted", async () => {
    stubNetwork("owner_admin");
    const session = {
      access_token: jwt("owner_admin"),
      refresh_token: "refresh-1",
      token_type: "bearer",
      expires_in: 3600,
      expires_at: exp,
      user: user("owner_admin"),
    };
    const guard = createAuthMiddleware({
      supabaseUrl: SUPABASE,
      supabaseKey: "publishable-key",
      cookieName: "sb-gunita-pos-auth",
      allowedRoles: ["barista"],
      publicPaths: ["/login"],
      restrictedPath: "/restricted",
      cookiePath: "/staff",
    });
    const res = await guard(
      new NextRequest("http://shop.local/staff/orders", {
        nextConfig: { basePath: "/staff" },
        headers: { cookie: `sb-gunita-pos-auth=base64-${b64url(session)}` },
      }),
    );
    expect(res.headers.get("x-middleware-rewrite")).toBe("http://shop.local/staff/restricted");
  });
});

describe("Owner portal under /admin", () => {
  const owner = { ...pos, cookieName: "sb-gunita-admin-auth", allowedRoles: ["owner_admin"] as const, cookiePath: "/admin", otpCookieName: "gk-admin-otp" };

  // Why: the emailed-code step must work under /admin. A challenge cookie scoped to /auth would
  // never reach /admin/auth/otp, and the Owner could not finish signing in.
  it("keeps the emailed-code challenge under /admin/auth", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith("/api/auth/login")) return Response.json({ success: true, data: { otpRequired: true, challenge: "challenge-1" } });
      if (url.endsWith("/api/auth/otp")) return Response.json({ success: true });
      throw new Error(`unexpected fetch ${url}`);
    });
    const h = createSessionHandlers({ ...owner, allowedRoles: ["owner_admin"] });
    const res = await h.login(
      new NextRequest("http://shop.local/admin/auth/login", { method: "POST", headers: { origin: "http://shop.local" }, body: "{}" }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie()).toContainEqual(expect.stringMatching(/^gk-admin-otp=challenge-1;.*Path=\/admin\/auth/i));
  });

  // Why: no one but the Owner gets into the Owner portal. A Barista session is shown
  // /admin/restricted, and Owner cookies are scoped to /admin so POS requests never carry them.
  it("rewrites a Barista session to /admin/restricted", async () => {
    stubNetwork("barista");
    const session = { access_token: jwt("barista"), refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: exp, user: user("barista") };
    const guard = createAuthMiddleware({
      supabaseUrl: SUPABASE, supabaseKey: "publishable-key", cookieName: "sb-gunita-admin-auth",
      allowedRoles: ["owner_admin"], publicPaths: ["/login"], restrictedPath: "/restricted", cookiePath: "/admin",
    });
    const res = await guard(
      new NextRequest("http://shop.local/admin/users", {
        nextConfig: { basePath: "/admin" },
        headers: { cookie: `sb-gunita-admin-auth=base64-${b64url(session)}` },
      }),
    );
    expect(res.headers.get("x-middleware-rewrite")).toBe("http://shop.local/admin/restricted");
  });
});
