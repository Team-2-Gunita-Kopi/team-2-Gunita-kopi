// End-to-end session flow with the real BFF handlers (/auth/login, /auth/logout, /api proxy) and the
// real middleware, against a fake Supabase Auth server and a fake apps/api:
// login, HttpOnly cookie, page refresh, navigation, token refresh, proxy, CSRF, logout, separation.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { NextRequest } from "next/server";
import { createAuthMiddleware } from "@/auth/middleware";
import { createSessionHandlers } from "@/auth/session-server";
import {
  ADMIN_OTP_COOKIE,
  ADMIN_RECOVERY_COOKIE,
  ADMIN_SESSION_COOKIE,
  POS_SESSION_COOKIE,
  type Role,
} from "@/auth/index";

const b64 = (o: unknown) =>
  Buffer.from(JSON.stringify(o)).toString("base64url");
type Tok = { id: string; role: Role; aal: string };
const access = new Map<string, Tok>();
const refresh = new Map<string, Tok>();
// Recovery codes per email, passwords set through PUT /user.
const emails: Record<string, { id: string; role: Role }> = {
  "owner@example.com": { id: "owner-1", role: "owner_admin" },
  "bea@staff.gunitakopi.local": { id: "bar-1", role: "barista" },
};
const otps = new Map<string, string>(); // email -> unused recovery code
const passwords: Record<string, string> = {};
// Fake apps/api Owner sign-in: challenge -> Owner, and the emailed code it accepts.
const challenges = new Map<string, { id: string; role: Role }>();
const SIGN_IN_CODE = "246810";
const hits: string[] = [];
const apiSeen: {
  path: string;
  auth: string | null;
  ip: string | null;
  secret: string | null;
  setupToken: string | null;
}[] = [];
const users: Record<string, { id: string; role: Role; ttl?: number }> = {
  eric: { id: "owner-1", role: "owner_admin" },
  bea: { id: "bar-1", role: "barista" },
  shorty: { id: "owner-2", role: "owner_admin", ttl: 30 },
};
let seq = 0;
const SECRET = "p".repeat(40);

function issue(id: string, role: Role, ttl = 3600, aal = "aal1") {
  const exp = Math.floor(Date.now() / 1000) + ttl;
  const at = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: id, exp, aud: "authenticated", role: "authenticated", aal, app_metadata: { role }, n: ++seq })}.sig`;
  const rt = `rt-${seq}`;
  access.set(at, { id, role, aal });
  refresh.set(rt, { id, role, aal });
  return {
    access_token: at,
    refresh_token: rt,
    expires_in: ttl,
    expires_at: exp,
  };
}
const user = (u: { id: string; role: Role }) => ({
  id: u.id,
  aud: "authenticated",
  role: "authenticated",
  app_metadata: { role: u.role },
  user_metadata: {},
  created_at: "2026-11-17T00:00:00Z",
});
const sessionOf = (u: Tok) => ({
  ...issue(u.id, u.role, 3600, u.aal),
  token_type: "bearer",
  user: user(u),
});

let authServer: Server, apiServer: Server;
let authUrl = "",
  apiUrl = "";
const listen = async (s: Server) => {
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
};
const readBody = (req: import("node:http").IncomingMessage) =>
  new Promise<string>((r) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => r(b));
  });

beforeAll(async () => {
  authServer = createServer(async (req, res) => {
    const body = await readBody(req);
    hits.push(`${req.method} ${req.url}`);
    const send = (status: number, json?: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(json === undefined ? "" : JSON.stringify(json));
    };
    const bearer = (req.headers.authorization ?? "").replace("Bearer ", "");
    if (req.url === "/auth/v1/user") {
      const u = access.get(bearer);
      if (!u) return send(403, { code: "bad_jwt", msg: "invalid JWT" });
      if (req.method === "PUT") passwords[u.id] = JSON.parse(body).password;
      return send(200, user(u));
    }
    if (req.url?.startsWith("/auth/v1/recover")) {
      const { email } = JSON.parse(body);
      if (emails[email]) otps.set(email, "654321");
      return send(200, {});
    }
    if (req.url?.startsWith("/auth/v1/verify")) {
      const { email, token, type } = JSON.parse(body);
      if (type !== "recovery" || otps.get(email) !== token || !emails[email])
        return send(403, {
          code: "otp_expired",
          msg: "Token has expired or is invalid",
        });
      otps.delete(email); // single use
      return send(200, sessionOf({ ...emails[email]!, aal: "aal1" }));
    }
    if (req.url?.startsWith("/auth/v1/token?grant_type=refresh_token")) {
      const rt = JSON.parse(body).refresh_token as string;
      const u = refresh.get(rt);
      if (!u)
        return send(400, {
          code: "refresh_token_not_found",
          msg: "Invalid Refresh Token",
        });
      refresh.delete(rt);
      return send(200, sessionOf(u));
    }
    if (req.url?.startsWith("/auth/v1/logout")) {
      const u = access.get(bearer);
      access.delete(bearer);
      for (const [k, v] of refresh) if (v.id === u?.id) refresh.delete(k);
      // scope=global also ends every other session of the account.
      if (req.url.includes("scope=global"))
        for (const [k, v] of access) if (v.id === u?.id) access.delete(k);
      return send(204);
    }
    send(404, { msg: "not found" });
  });
  // Fake apps/api: username login (password "good") and an echo endpoint.
  apiServer = createServer(async (req, res) => {
    const body = await readBody(req);
    apiSeen.push({
      path: req.url ?? "",
      auth: req.headers.authorization ?? null,
      ip: (req.headers["x-gunita-client-ip"] as string) ?? null,
      secret: (req.headers["x-gunita-proxy-secret"] as string) ?? null,
      setupToken: (req.headers["x-setup-token"] as string) ?? null,
    });
    res.setHeader("content-type", "application/json");
    if (req.url === "/api/auth/login") {
      const { username, password } = JSON.parse(body);
      const u = users[username];
      if (!u || password !== "good") {
        res.statusCode = 401;
        return res.end(
          JSON.stringify({
            success: false,
            error: {
              code: "UNAUTHORIZED",
              message: "Invalid username or password",
            },
          }),
        );
      }
      if (u.role === "owner_admin") {
        // Like apps/api: no session for the Owner until the emailed code is accepted.
        const challenge = `ch-${++seq}`.padEnd(40, "x");
        challenges.set(challenge, u);
        return res.end(
          JSON.stringify({ success: true, data: { otpRequired: true, challenge } }),
        );
      }
      const t = issue(u.id, u.role, u.ttl);
      return res.end(
        JSON.stringify({
          success: true,
          data: {
            accessToken: t.access_token,
            refreshToken: t.refresh_token,
            expiresAt: t.expires_at,
          },
        }),
      );
    }
    if (req.url === "/api/auth/otp") {
      const { action, challenge, code } = JSON.parse(body);
      const u = challenges.get(challenge);
      const fail = (status: number, code: string) => {
        res.statusCode = status;
        res.end(JSON.stringify({ success: false, error: { code, message: code } }));
      };
      if (!u) return fail(401, "OTP_EXPIRED");
      if (action === "send")
        return res.end(JSON.stringify({ success: true, data: { sent: true } }));
      if (code !== SIGN_IN_CODE) return fail(400, "INVALID_CODE");
      challenges.delete(challenge);
      const t = issue(u.id, u.role, (u as { ttl?: number }).ttl);
      return res.end(
        JSON.stringify({
          success: true,
          data: { accessToken: t.access_token, refreshToken: t.refresh_token },
        }),
      );
    }
    res.end(
      JSON.stringify({
        success: true,
        data: { method: req.method, path: req.url, body },
      }),
    );
  });
  authUrl = await listen(authServer);
  apiUrl = await listen(apiServer);
});
afterAll(() => {
  authServer.close();
  apiServer.close();
});
beforeEach(() => {
  hits.length = 0;
  apiSeen.length = 0;
});

const site = (
  cookieName: string,
  allowedRoles: Role[],
  origin: string,
  extra: { recoveryCookieName?: string } = {},
) => {
  const opts = {
    supabaseUrl: authUrl,
    supabaseKey: "publishable-key",
    cookieName,
    allowedRoles,
  };
  return {
    origin,
    handlers: createSessionHandlers({
      ...opts,
      apiUrl,
      proxySecret: SECRET,
      recoveryCookieName: extra.recoveryCookieName,
      // As in apps/admin: only the Owner portal runs the emailed-code step.
      otpCookieName:
        cookieName === ADMIN_SESSION_COOKIE ? ADMIN_OTP_COOKIE : undefined,
    }),
    guard: createAuthMiddleware({
      ...opts,
      publicPaths: ["/login", "/auth/", "/forgot-password"],
    }),
  };
};
const admin = () =>
  site(ADMIN_SESSION_COOKIE, ["owner_admin"], "http://localhost:3000");
const pos = () =>
  site(POS_SESSION_COOKIE, ["barista", "owner_admin"], "http://localhost:3001");
type Site = ReturnType<typeof admin>;

// Browser cookie jar fed from Set-Cookie headers.
class Jar {
  m = new Map<string, string>();
  take(res: Response) {
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const i = pair!.indexOf("=");
      const name = pair!.slice(0, i),
        value = pair!.slice(i + 1);
      if (!value || /max-age=0/i.test(c)) this.m.delete(name);
      else this.m.set(name, value);
    }
    return res;
  }
  get header() {
    return [...this.m].map(([n, v]) => `${n}=${v}`).join("; ");
  }
}

const req = (
  s: Site,
  path: string,
  init: {
    method?: string;
    body?: string;
    cookie?: string;
    origin?: string | null;
  } = {},
) => {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (init.cookie) headers.cookie = init.cookie;
  const origin = init.origin === undefined ? s.origin : init.origin;
  if (origin) headers.origin = origin;
  return new NextRequest(`${s.origin}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body,
  });
};
const loginStep = async (
  s: Site,
  jar: Jar,
  username: string,
  password = "good",
  origin?: string | null,
) =>
  jar.take(
    await s.handlers.login(
      req(s, "/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
        cookie: jar.header,
        origin,
      }),
    ),
  );
const otpStep = async (s: Site, jar: Jar, body: unknown, origin?: string | null) =>
  jar.take(
    await s.handlers.otp(
      req(s, "/auth/otp", {
        method: "POST",
        body: JSON.stringify(body),
        cookie: jar.header,
        origin,
      }),
    ),
  );
// Full sign-in: password, then (Owner) the emailed code. Returns the response that set the session.
const login = async (
  s: Site,
  jar: Jar,
  username: string,
  password = "good",
  origin?: string | null,
) => {
  const res = await loginStep(s, jar, username, password, origin);
  const body = await res.clone().json().catch(() => null);
  return body?.data?.otpRequired
    ? otpStep(s, jar, { action: "verify", code: SIGN_IN_CODE })
    : res;
};
const visit = async (s: Site, jar: Jar, path: string) =>
  jar.take(await s.guard(req(s, path, { cookie: jar.header })));
const callApi = async (
  s: Site,
  jar: Jar,
  path: string,
  method = "GET",
  origin?: string | null,
) =>
  jar.take(
    await s.handlers.proxy(
      req(s, `/api/${path}`, {
        method,
        cookie: jar.header,
        origin,
        body: method === "GET" ? undefined : "{}",
      }),
      { params: Promise.resolve({ path: path.split("?")[0]!.split("/") }) },
    ),
  );
const passed = (res: Response) => res.headers.get("x-middleware-next") === "1";
const location = (res: Response) =>
  new URL(res.headers.get("location") ?? "http://x/");

describe("HttpOnly session: Admin", () => {
  it("login sets an HttpOnly, SameSite=Lax session cookie and returns no token", async () => {
    const s = admin(),
      jar = new Jar();
    const res = await login(s, jar, "eric");
    expect(res.status).toBe(200);
    const cookies = res.headers.getSetCookie();
    expect(cookies.length).toBeGreaterThan(0);
    for (const c of cookies.filter((c) => c.startsWith(ADMIN_SESSION_COOKIE))) {
      expect(c).toMatch(/HttpOnly/i);
      expect(c).toMatch(/SameSite=lax/i);
      expect(c).toMatch(/Path=\//i);
    }
    expect(cookies.some((c) => c.startsWith(ADMIN_SESSION_COOKIE))).toBe(true);
    const body = JSON.stringify(await res.json());
    expect(body).not.toMatch(/access|refresh|token/i);
  });

  it("forwards the client IP to the API with the shared secret", async () => {
    await login(admin(), new Jar(), "eric");
    const call = apiSeen.find((c) => c.path === "/api/auth/login")!;
    expect(call.ip).toBe("127.0.0.1");
    expect(call.secret).toBe(SECRET);
  });

  it("guard accepts the session on load, page refresh and navigation", async () => {
    const s = admin(),
      jar = new Jar();
    await login(s, jar, "eric");
    for (const path of ["/dashboard", "/dashboard", "/products", "/users"]) {
      expect(passed(await visit(s, jar, path))).toBe(true);
    }
  });

  it("proxy calls the API with the Bearer token from the cookie", async () => {
    const s = admin(),
      jar = new Jar();
    await login(s, jar, "eric");
    const res = await callApi(s, jar, "admin/employees", "POST");
    expect(res.status).toBe(200);
    const seen = apiSeen.find((c) => c.path === "/api/admin/employees")!;
    expect(seen.auth).toMatch(/^Bearer .+\..+\.sig$/);
    expect(access.has(seen.auth!.slice(7))).toBe(true);
  });

  it("proxy forwards without a token when signed out, and never proxies sign-in or Owner setup", async () => {
    const s = admin(),
      jar = new Jar();
    await callApi(s, jar, "products");
    expect(apiSeen.find((c) => c.path === "/api/products")!.auth).toBeNull();
    for (const path of ["auth/login", "auth/otp", "setup/owner"]) {
      expect((await callApi(s, jar, path, "POST")).status).toBe(404);
      expect((await callApi(pos(), jar, path, "POST")).status).toBe(404);
    }
    expect(apiSeen.some((c) => c.path.startsWith("/api/auth/"))).toBe(false);
    expect(apiSeen.some((c) => c.path.startsWith("/api/setup/"))).toBe(false);
  });

  it("refuses cross-site requests (CSRF) to login, logout and state-changing proxy calls", async () => {
    const s = admin(),
      jar = new Jar();
    expect(
      (await login(s, new Jar(), "eric", "good", "https://evil.example"))
        .status,
    ).toBe(403);
    await login(s, jar, "eric");
    expect(
      (await callApi(s, jar, "admin/employees", "POST", "https://evil.example"))
        .status,
    ).toBe(403);
    expect(
      (await callApi(s, jar, "admin/employees", "POST", null)).status,
    ).toBe(403);
    const out = await s.handlers.logout(
      req(s, "/auth/logout", {
        method: "POST",
        cookie: jar.header,
        origin: "https://evil.example",
      }),
    );
    expect(out.status).toBe(403);
    expect(passed(await visit(s, jar, "/dashboard"))).toBe(true);
  });

  it("wrong password: API error passes through, no cookie is set", async () => {
    const s = admin(),
      jar = new Jar();
    const res = await login(s, jar, "eric", "bad");
    expect(res.status).toBe(401);
    expect(res.headers.getSetCookie()).toHaveLength(0);
  });

  it("a barista cannot sign in to the Owner portal; the issued session is revoked", async () => {
    const s = admin(),
      jar = new Jar();
    const res = await login(s, jar, "bea");
    expect(res.status).toBe(403);
    expect(res.headers.getSetCookie()).toHaveLength(0);
    expect(hits.some((h) => h.startsWith("POST /auth/v1/logout"))).toBe(true);
  });

  it("redirects a visitor without a session to /login with the return path", async () => {
    const res = await visit(admin(), new Jar(), "/reports");
    expect(res.status).toBe(307);
    expect(location(res).pathname).toBe("/login");
    expect(location(res).searchParams.get("redirect")).toBe("/reports");
  });

  it("rejects a forged cookie that claims owner_admin", async () => {
    const forged = {
      access_token: `${b64({ alg: "HS256" })}.${b64({ sub: "x", exp: 9999999999, app_metadata: { role: "owner_admin" } })}.forged`,
      refresh_token: "nope",
      expires_at: 9999999999,
      expires_in: 3600,
      token_type: "bearer",
      user: { id: "x" },
    };
    const jar = new Jar();
    jar.m.set(
      ADMIN_SESSION_COOKIE,
      `base64-${Buffer.from(JSON.stringify(forged)).toString("base64url")}`,
    );
    expect(location(await visit(admin(), jar, "/dashboard")).pathname).toBe(
      "/login",
    );
  });

  it("session expiry: guard and proxy refresh the token and rewrite the HttpOnly cookie", async () => {
    const s = admin(),
      jar = new Jar();
    await login(s, jar, "shorty"); // 30-second access token
    const before = jar.header;
    const page = await visit(s, jar, "/dashboard");
    expect(passed(page)).toBe(true);
    expect(hits.some((h) => h.includes("grant_type=refresh_token"))).toBe(true);
    expect(page.headers.getSetCookie().every((c) => /HttpOnly/i.test(c))).toBe(
      true,
    );
    expect(jar.header).not.toBe(before);
    expect((await callApi(s, jar, "dashboard")).status).toBe(200);
  });

  it("logout revokes the session, clears the cookie, and the guard sends the user to /login", async () => {
    const s = admin(),
      jar = new Jar();
    await login(s, jar, "eric");
    const out = jar.take(
      await s.handlers.logout(
        req(s, "/auth/logout", { method: "POST", cookie: jar.header }),
      ),
    );
    expect(out.status).toBe(200);
    expect(hits.some((h) => h.startsWith("POST /auth/v1/logout"))).toBe(true);
    expect(jar.m.size).toBe(0);
    expect(location(await visit(s, jar, "/dashboard")).pathname).toBe("/login");
  });
});

describe("HttpOnly session: POS", () => {
  it("barista login passes the POS guard across refresh and navigation", async () => {
    const s = pos(),
      jar = new Jar();
    expect((await login(s, jar, "bea")).status).toBe(200);
    for (const path of ["/pos", "/pos", "/orders", "/inventory"]) {
      expect(passed(await visit(s, jar, path))).toBe(true);
    }
  });

  it("keeps Admin and POS sessions separate on the same host", async () => {
    const jar = new Jar();
    await login(pos(), jar, "bea");
    expect(
      [...jar.m.keys()].every((n) => n.startsWith(POS_SESSION_COOKIE)),
    ).toBe(true);
    expect(
      location(await visit(admin(), jar, "/dashboard")).searchParams.get(
        "redirect",
      ),
    ).toBe("/dashboard");
    await login(admin(), jar, "eric");
    expect(passed(await visit(admin(), jar, "/dashboard"))).toBe(true);
    expect(passed(await visit(pos(), jar, "/pos"))).toBe(true);
  });

  it("logout clears the POS session", async () => {
    const s = pos(),
      jar = new Jar();
    await login(s, jar, "bea");
    jar.take(
      await s.handlers.logout(
        req(s, "/auth/logout", { method: "POST", cookie: jar.header }),
      ),
    );
    expect(location(await visit(s, jar, "/pos")).pathname).toBe("/login");
  });
});

// ---------------------------------------------------------------------------
// Owner emailed sign-in code (SDS 2.4) and password recovery, on the same HttpOnly cookie design.
// ---------------------------------------------------------------------------
const owner = () =>
  site(ADMIN_SESSION_COOKIE, ["owner_admin"], "http://localhost:3000", {
    recoveryCookieName: ADMIN_RECOVERY_COOKIE,
  });
type Json = { success: boolean; data?: any; error?: any };
const post = async (
  s: Site,
  jar: Jar,
  handler: "otp" | "recovery",
  body: unknown,
  origin?: string | null,
) => {
  const res = jar.take(
    await s.handlers[handler](
      req(s, `/auth/${handler}`, {
        method: "POST",
        body: JSON.stringify(body),
        cookie: jar.header,
        origin,
      }),
    ),
  );
  return { res, body: (await res.json()) as Json };
};

describe("Owner emailed sign-in code", () => {
  it("the password gives no session: only a short HttpOnly challenge cookie, and a code is emailed", async () => {
    const s = owner(),
      jar = new Jar();
    const res = await loginStep(s, jar, "eric");
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ otpRequired: true });
    const cookies = res.headers.getSetCookie();
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatch(new RegExp(`^${ADMIN_OTP_COOKIE}=`));
    expect(cookies[0]).toMatch(/HttpOnly/i);
    expect(cookies[0]).toMatch(/SameSite=strict/i);
    expect(cookies[0]).toMatch(/Path=\/auth/i);
    expect(cookies[0]).toMatch(/Max-Age=600/i);
    expect(apiSeen.filter((c) => c.path === "/api/auth/otp")).toHaveLength(1);
    expect(location(await visit(s, jar, "/dashboard")).pathname).toBe("/login");
  });

  it("a wrong code keeps the challenge; the right code sets the session and drops the challenge", async () => {
    const s = owner(),
      jar = new Jar();
    await loginStep(s, jar, "eric");
    const bad = await post(s, jar, "otp", { action: "verify", code: "000000" });
    expect(bad.res.status).toBe(400);
    expect(bad.body.error.code).toBe("INVALID_CODE");
    expect(jar.m.has(ADMIN_SESSION_COOKIE)).toBe(false);
    expect(jar.m.has(ADMIN_OTP_COOKIE)).toBe(true);

    const good = await post(s, jar, "otp", { action: "verify", code: SIGN_IN_CODE });
    expect(good.res.status).toBe(200);
    expect(JSON.stringify(good.body)).not.toMatch(/access|refresh|token/i);
    expect(jar.m.has(ADMIN_OTP_COOKIE)).toBe(false);
    expect(passed(await visit(s, jar, "/dashboard"))).toBe(true);
  });

  it("a used-up challenge drops the cookie so the Owner signs in again", async () => {
    const s = owner(),
      jar = new Jar();
    await loginStep(s, jar, "eric");
    challenges.clear(); // expired or over its limits at apps/api
    const res = await post(s, jar, "otp", { action: "verify", code: SIGN_IN_CODE });
    expect(res.res.status).toBe(401);
    expect(res.body.error.code).toBe("OTP_EXPIRED");
    expect(jar.m.has(ADMIN_OTP_COOKIE)).toBe(false);
  });

  it("resend asks apps/api for a new code", async () => {
    const s = owner(),
      jar = new Jar();
    await loginStep(s, jar, "eric");
    const r = await post(s, jar, "otp", { action: "resend" });
    expect(r.res.status).toBe(200);
    expect(apiSeen.filter((c) => c.path === "/api/auth/otp")).toHaveLength(2);
  });

  it("refuses without a challenge, cross-site, and with a malformed code", async () => {
    const s = owner(),
      jar = new Jar();
    expect((await post(s, jar, "otp", { action: "verify", code: SIGN_IN_CODE })).res.status).toBe(401);
    await loginStep(s, jar, "eric");
    expect(
      (await post(s, jar, "otp", { action: "verify", code: SIGN_IN_CODE }, "https://evil.example")).res
        .status,
    ).toBe(403);
    expect((await post(s, jar, "otp", { action: "verify", code: "12ab56" })).res.status).toBe(400);
    expect(jar.m.has(ADMIN_SESSION_COOKIE)).toBe(false);
  });

  it("the POS refuses an Owner account without emailing a code", async () => {
    const jar = new Jar();
    const res = await loginStep(pos(), jar, "eric");
    expect(res.status).toBe(403);
    expect(res.headers.getSetCookie()).toHaveLength(0);
    expect(apiSeen.some((c) => c.path === "/api/auth/otp")).toBe(false);
    expect((await post(pos(), jar, "otp", { action: "resend" })).res.status).toBe(404);
  });
});

describe("Owner password recovery", () => {
  beforeEach(() => otps.clear());
  const email = "owner@example.com";

  it("answers the same for known and unknown emails", async () => {
    const s = owner();
    const known = await post(s, new Jar(), "recovery", {
      step: "request",
      email: "Owner@Example.com",
    });
    const unknown = await post(s, new Jar(), "recovery", {
      step: "request",
      email: "nobody@example.com",
    });
    expect(known.res.status).toBe(200);
    expect(unknown.res.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
    expect(otps.has(email)).toBe(true);
  });

  it("verify keeps the recovery session in a 15-minute HttpOnly cookie that opens no page", async () => {
    const s = owner(),
      jar = new Jar();
    await post(s, jar, "recovery", { step: "request", email });
    const v = await post(s, jar, "recovery", {
      step: "verify",
      email,
      code: "654321",
    });
    expect(v.res.status).toBe(200);
    expect(JSON.stringify(v.body)).not.toMatch(/token/i);
    const cookies = v.res.headers.getSetCookie();
    expect(cookies.length).toBeGreaterThan(0);
    for (const c of cookies) {
      expect(c.startsWith(ADMIN_RECOVERY_COOKIE)).toBe(true);
      expect(c).toMatch(/HttpOnly/i);
      expect(c).toMatch(/Max-Age=900/i);
    }
    expect(location(await visit(s, jar, "/dashboard")).pathname).toBe("/login");
  });

  it("wrong, reused or barista codes are refused with one generic message", async () => {
    const s = owner();
    await post(s, new Jar(), "recovery", { step: "request", email });
    const wrong = await post(s, new Jar(), "recovery", {
      step: "verify",
      email,
      code: "111111",
    });
    expect(wrong.res.status).toBe(400);
    expect(wrong.body.error.code).toBe("INVALID_CODE");

    await post(s, new Jar(), "recovery", {
      step: "verify",
      email,
      code: "654321",
    });
    const reused = await post(s, new Jar(), "recovery", {
      step: "verify",
      email,
      code: "654321",
    });
    expect(reused.body.error).toEqual(wrong.body.error);

    otps.set("bea@staff.gunitakopi.local", "654321");
    const jar = new Jar();
    const barista = await post(s, jar, "recovery", {
      step: "verify",
      email: "bea@staff.gunitakopi.local",
      code: "654321",
    });
    expect(barista.body.error).toEqual(wrong.body.error);
    expect(jar.m.size).toBe(0);
  });

  it("reset saves the password, ends every session of the account, and grants no access", async () => {
    const s = owner();
    const signedIn = new Jar();
    await login(s, signedIn, "eric");
    const jar = new Jar();
    await post(s, jar, "recovery", { step: "request", email });
    await post(s, jar, "recovery", { step: "verify", email, code: "654321" });

    const short = await post(s, jar, "recovery", {
      step: "reset",
      password: "short",
    });
    expect(short.res.status).toBe(400);

    const reset = await post(s, jar, "recovery", {
      step: "reset",
      password: "a-new-password",
    });
    expect(reset.res.status).toBe(200);
    expect(passwords["owner-1"]).toBe("a-new-password");
    expect(
      hits.some((h) => h.includes("/logout") && h.includes("scope=global")),
    ).toBe(true);
    expect(jar.m.size).toBe(0);
    // The session signed in before the reset no longer works.
    expect(location(await visit(s, signedIn, "/dashboard")).pathname).toBe("/login");
    // A second reset without a new code is refused.
    expect(
      (
        await post(s, jar, "recovery", {
          step: "reset",
          password: "another-pass",
        })
      ).res.status,
    ).toBe(401);
  });

  it("refuses cross-site recovery calls, and sites without recovery", async () => {
    const body = { step: "request", email };
    expect(
      (await post(owner(), new Jar(), "recovery", body, "https://evil.example"))
        .res.status,
    ).toBe(403);
    expect((await post(pos(), new Jar(), "recovery", body)).res.status).toBe(
      404,
    );
  });
});
