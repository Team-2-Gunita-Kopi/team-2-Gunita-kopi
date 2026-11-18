import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { hasRole, type Role } from "./index";
import { sessionCookieOptions } from "./cookies";
import { trustedClientIp } from "./client-ip";

export interface SessionHandlerOptions {
  supabaseUrl: string;
  supabaseKey: string;
  cookieName: string;
  /** Base URL of apps/api, called server to server. */
  apiUrl: string;
  /** Shared with apps/api (INTERNAL_PROXY_SECRET); lets the API trust the forwarded client IP. */
  proxySecret: string;
  allowedRoles: readonly Role[];
}

type Cookie = {
  name: string;
  value: string;
  options: Parameters<NextResponse["cookies"]["set"]>[2];
};

const fail = (status: number, code: string, message: string) =>
  NextResponse.json({ success: false, error: { code, message } }, { status });

const unavailable = () =>
  fail(503, "SERVICE_UNAVAILABLE", "Sign-in is temporarily unavailable");

// Cookie-authenticated state changes are accepted only from this site's own pages (CSRF).
const sameOrigin = (req: NextRequest) =>
  req.headers.get("origin") === req.nextUrl.origin;

/**
 * Backend-for-frontend session routes for the Admin and POS sites.
 * The Supabase session lives only in an HttpOnly cookie; the browser never holds a token.
 * - POST /auth/login:  username sign-in through apps/api, then sets the cookie.
 * - POST /auth/logout: revokes the session and clears the cookie.
 * - /api/*:            same-origin proxy to apps/api that adds the Bearer token from the cookie.
 */
export function createSessionHandlers(opts: SessionHandlerOptions) {
  const session = (req: NextRequest) => {
    const pending: Cookie[] = [];
    const client = createServerClient(opts.supabaseUrl, opts.supabaseKey, {
      cookieOptions: sessionCookieOptions(opts.cookieName),
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookies) => {
          pending.push(...cookies);
        },
      },
    });
    const apply = (res: NextResponse) => {
      pending.forEach(({ name, value, options }) =>
        res.cookies.set(name, value, options),
      );
      res.headers.set("cache-control", "private, no-store");
      return res;
    };
    return { client, apply };
  };

  async function login(req: NextRequest) {
    if (!sameOrigin(req))
      return fail(403, "FORBIDDEN", "Cross-site request refused");
    const ip = trustedClientIp(req.headers);
    if (!ip) {
      console.error(
        JSON.stringify({
          level: "error",
          message: "auth.client_ip_unavailable",
        }),
      );
      return unavailable();
    }
    const body = await req.text();

    const upstream = await fetch(`${opts.apiUrl}/api/auth/login`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-gunita-client-ip": ip,
        "x-gunita-proxy-secret": opts.proxySecret,
      },
      body,
      cache: "no-store",
    }).catch(() => null);
    if (!upstream) return unavailable();
    const payload = await upstream.json().catch(() => null);
    if (!upstream.ok || !payload?.success) {
      return NextResponse.json(
        payload ?? {
          success: false,
          error: { code: "AUTH_ERROR", message: "Sign-in failed" },
        },
        { status: upstream.ok ? 502 : upstream.status },
      );
    }

    const { client, apply } = session(req);
    const { data, error } = await client.auth.setSession({
      access_token: payload.data.accessToken,
      refresh_token: payload.data.refreshToken,
    });
    if (error || !data.user) return fail(502, "AUTH_ERROR", "Sign-in failed");
    if (!hasRole(data.user.app_metadata?.role, opts.allowedRoles)) {
      // Revoke the session just issued; no cookie is written.
      await client.auth.signOut();
      return fail(403, "FORBIDDEN", "This account cannot use this site");
    }
    // Display details only; never tokens.
    const meta = data.user.user_metadata ?? {};
    return apply(
      NextResponse.json({
        success: true,
        data: {
          userId: data.user.id,
          role: data.user.app_metadata?.role,
          fullName: typeof meta.full_name === "string" ? meta.full_name : "",
          username: typeof meta.username === "string" ? meta.username : "",
        },
      }),
    );
  }

  async function logout(req: NextRequest) {
    if (!sameOrigin(req))
      return fail(403, "FORBIDDEN", "Cross-site request refused");
    const { client, apply } = session(req);
    const { error } = await client.auth.signOut();
    // Auth unreachable: still clear this browser's cookie.
    if (error) await client.auth.signOut({ scope: "local" });
    return apply(NextResponse.json({ success: true }));
  }

  async function proxy(
    req: NextRequest,
    ctx: { params: Promise<{ path: string[] }> },
  ) {
    const path = (await ctx.params).path.map(encodeURIComponent).join("/");
    // Tokens must never reach the browser: sign-in goes through /auth/login only.
    if (path === "auth/login") return fail(404, "NOT_FOUND", "Not found");
    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    if (hasBody && !sameOrigin(req))
      return fail(403, "FORBIDDEN", "Cross-site request refused");

    const { client, apply } = session(req);
    // Reads the cookie and refreshes an expiring token; apps/api verifies the token itself.
    const { data } = await client.auth.getSession();
    const headers = new Headers();
    for (const h of ["content-type", "x-request-id", "x-setup-token"]) {
      const v = req.headers.get(h);
      if (v) headers.set(h, v);
    }
    if (data.session) {
      headers.set("authorization", `Bearer ${data.session.access_token}`);
    }

    const upstream = await fetch(
      `${opts.apiUrl}/api/${path}${req.nextUrl.search}`,
      {
        method: req.method,
        headers,
        body: hasBody ? await req.arrayBuffer() : undefined,
        cache: "no-store",
      },
    ).catch(() => null);
    if (!upstream) {
      return apply(fail(502, "BAD_GATEWAY", "The API is unreachable"));
    }
    return apply(
      new NextResponse(upstream.body, {
        status: upstream.status,
        headers: {
          "content-type":
            upstream.headers.get("content-type") ?? "application/json",
        },
      }),
    );
  }

  return { login, logout, proxy };
}
