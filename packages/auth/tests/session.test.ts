// End-to-end session flow with the real BFF handlers (/auth/login, /auth/logout, /api proxy) and the
// real middleware, against a fake Supabase Auth server and a fake apps/api:
// login, HttpOnly cookie, page refresh, navigation, token refresh, proxy, CSRF, logout, separation.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { NextRequest } from "next/server";
import { createAuthMiddleware } from "../src/middleware";
import { createSessionHandlers } from "../src/session-server";
import {
  ADMIN_RECOVERY_COOKIE,
  ADMIN_SESSION_COOKIE,
  POS_SESSION_COOKIE,
  type Role,
} from "../src/index";

const b64 = (o: unknown) =>
  Buffer.from(JSON.stringify(o)).toString("base64url");
type Tok = { id: string; role: Role; aal: string };
const access = new Map<string, Tok>();
const refresh = new Map<string, Tok>();
// MFA factors per user, recovery codes per email, passwords set through PUT /user.
type Factor = {
  id: string;
  factor_type: "totp";
  status: "verified" | "unverified";
  created_at: string;
  friendly_name: string;
};
const factors: Record<string, Factor[]> = {};
const emails: Record<string, { id: string; role: Role }> = {
  "owner@example.com": { id: "owner-1", role: "owner_admin" },
  "bea@staff.gunitakopi.local": { id: "bar-1", role: "barista" },
};
const otps = new Map<string, string>(); // email -> unused recovery code
const passwords: Record<string, string> = {};
const TOTP = "123456";
const hits: string[] = [];
const apiSeen: {
  path: string;
  auth: string | null;
  ip: string | null;
  secret: string | null;
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
  factors: factors[u.id] ?? [],
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
    const factorPath =
      /^\/auth\/v1\/factors(?:\/([^/]+))?(?:\/(challenge|verify))?$/.exec(
        req.url ?? "",
      );
    if (factorPath) {
      const u = access.get(bearer);
      if (!u) return send(403, { code: "bad_jwt", msg: "invalid JWT" });
      const [, fid, step] = factorPath;
      const list = (factors[u.id] ??= []);
      if (!fid && req.method === "POST") {
        // Like Supabase: a verified factor means a new one needs aal2.
        if (list.some((f) => f.status === "verified") && u.aal !== "aal2")
          return send(403, { code: "insufficient_aal", msg: "AAL2 required" });
        const f: Factor = {
          id: `f-${++seq}`,
          factor_type: "totp",
          status: "unverified",
          created_at: new Date(Date.now() + seq).toISOString(),
          friendly_name: JSON.parse(body).friendly_name,
        };
        list.push(f);
        return send(200, {
          id: f.id,
          type: "totp",
          friendly_name: f.friendly_name,
          totp: {
            qr_code: "<svg/>",
            secret: "JBSWY3DP",
            uri: "otpauth://totp/x",
          },
        });
      }
      if (fid && !step && req.method === "DELETE") {
        factors[u.id] = list.filter((f) => f.id !== fid);
        return send(200, { id: fid });
      }
      if (step === "challenge")
        return send(200, {
          id: `ch-${fid}`,
          type: "totp",
          expires_at: 9999999999,
        });
      if (step === "verify") {
        const f = list.find((x) => x.id === fid);
        if (!f || JSON.parse(body).code !== TOTP)
          return send(422, {
            code: "mfa_verification_failed",
            msg: "Invalid TOTP code entered",
          });
        f.status = "verified";
        return send(200, sessionOf({ ...u, aal: "aal2" }));
      }
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
  extra: { mfaPath?: string; recoveryCookieName?: string } = {},
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
    }),
    guard: createAuthMiddleware({
      ...opts,
      publicPaths: ["/login", "/auth/", "/forgot-password"],
      mfaPath: extra.mfaPath,
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
const login = async (
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
    for (const c of cookies) {
      expect(c.startsWith(ADMIN_SESSION_COOKIE)).toBe(true);
      expect(c).toMatch(/HttpOnly/i);
      expect(c).toMatch(/SameSite=lax/i);
      expect(c).toMatch(/Path=\//i);
    }
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

  it("proxy forwards without a token when signed out, and never proxies sign-in", async () => {
    const s = admin(),
      jar = new Jar();
    await callApi(s, jar, "products");
    expect(apiSeen.find((c) => c.path === "/api/products")!.auth).toBeNull();
    const res = await callApi(s, jar, "auth/login", "POST");
    expect(res.status).toBe(404);
    expect(apiSeen.some((c) => c.path === "/api/auth/login")).toBe(false);
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
// Owner MFA (SDS 2.4, 2.8) and password recovery, on the same HttpOnly cookie design.
// ---------------------------------------------------------------------------
const owner = () =>
  site(ADMIN_SESSION_COOKIE, ["owner_admin"], "http://localhost:3000", {
    mfaPath: "/mfa",
    recoveryCookieName: ADMIN_RECOVERY_COOKIE,
  });
type Json = { success: boolean; data?: any; error?: any };
const post = async (
  s: Site,
  jar: Jar,
  handler: "mfa" | "recovery",
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
const claimsIn = (jar: Jar) => {
  const raw = jar.m.get(ADMIN_SESSION_COOKIE)!;
  const s = JSON.parse(Buffer.from(raw.slice(7), "base64url").toString());
  return JSON.parse(
    Buffer.from(s.access_token.split(".")[1], "base64url").toString(),
  );
};

describe("Owner MFA", () => {
  beforeEach(() => {
    delete factors["owner-1"];
  });

  it("login reports that the second step is needed; pages redirect to /mfa until it is done", async () => {
    const s = owner(),
      jar = new Jar();
    const res = await login(s, jar, "eric");
    expect((await res.json()).data.mfaRequired).toBe(true);
    const page = await visit(s, jar, "/reports");
    expect(page.status).toBe(307);
    expect(location(page).pathname).toBe("/mfa");
    expect(location(page).searchParams.get("redirect")).toBe("/reports");
    expect(passed(await visit(s, jar, "/mfa"))).toBe(true);
  });

  it("first sign-in: enrolls a TOTP factor, rejects a wrong code, accepts the right one (aal2)", async () => {
    const s = owner(),
      jar = new Jar();
    await login(s, jar, "eric");
    const start = await post(s, jar, "mfa", { action: "start" });
    expect(start.body.data).toMatchObject({
      step: "enroll",
      secret: "JBSWY3DP",
    });
    expect(start.body.data.qrCode).toMatch(/^data:image\/svg\+xml/);
    expect(JSON.stringify(start.body)).not.toMatch(
      /access_token|refresh_token/,
    );

    const bad = await post(s, jar, "mfa", { action: "verify", code: "000000" });
    expect(bad.res.status).toBe(400);
    expect(bad.body.error.code).toBe("INVALID_CODE");
    expect(location(await visit(s, jar, "/dashboard")).pathname).toBe("/mfa");

    const good = await post(s, jar, "mfa", { action: "verify", code: TOTP });
    expect(good.res.status).toBe(200);
    expect(
      good.res.headers.getSetCookie().every((c) => /HttpOnly/i.test(c)),
    ).toBe(true);
    expect(claimsIn(jar).aal).toBe("aal2");
    expect(passed(await visit(s, jar, "/dashboard"))).toBe(true);
    expect(JSON.stringify(good.body)).not.toMatch(/token/i);
  });

  it("later sign-ins ask for a code only and never enroll a second factor", async () => {
    const s = owner();
    const first = new Jar();
    await login(s, first, "eric");
    await post(s, first, "mfa", { action: "start" });
    await post(s, first, "mfa", { action: "verify", code: TOTP });

    const jar = new Jar();
    await login(s, jar, "eric");
    const start = await post(s, jar, "mfa", { action: "start" });
    expect(start.body.data).toEqual({ step: "verify" });
    expect(factors["owner-1"]).toHaveLength(1);
    expect(
      (await post(s, jar, "mfa", { action: "verify", code: TOTP })).res.status,
    ).toBe(200);
    expect(claimsIn(jar).aal).toBe("aal2");
  });

  it("an unfinished setup is replaced on the next start", async () => {
    const s = owner(),
      jar = new Jar();
    await login(s, jar, "eric");
    await post(s, jar, "mfa", { action: "start" });
    await post(s, jar, "mfa", { action: "start" });
    expect(factors["owner-1"]).toHaveLength(1);
  });

  it("refuses without a session, cross-site, and with a malformed code", async () => {
    const s = owner(),
      jar = new Jar();
    expect((await post(s, jar, "mfa", { action: "start" })).res.status).toBe(
      401,
    );
    await login(s, jar, "eric");
    expect(
      (await post(s, jar, "mfa", { action: "start" }, "https://evil.example"))
        .res.status,
    ).toBe(403);
    expect(
      (await post(s, jar, "mfa", { action: "verify", code: "12ab56" })).res
        .status,
    ).toBe(400);
  });

  it("baristas need no second step on the POS", async () => {
    const s = site(POS_SESSION_COOKIE, ["barista"], "http://localhost:3001", {
        mfaPath: "/mfa",
      }),
      jar = new Jar();
    const res = await login(s, jar, "bea");
    expect((await res.json()).data.mfaRequired).toBe(false);
    expect(passed(await visit(s, jar, "/pos"))).toBe(true);
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
    expect(location(await visit(s, signedIn, "/mfa")).pathname).toBe("/login");
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
