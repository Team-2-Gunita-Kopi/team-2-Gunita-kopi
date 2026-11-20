import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  decodeJwtPayload,
  hasRole,
  needsSecondFactor,
  ADMIN_SESSION_COOKIE,
  type Role,
} from "./index";
import { sessionCookieOptions } from "./cookies";
import { trustedClientIp } from "./client-ip";
import { isLoopbackHost, isLoopbackUrl } from "./local-url";

export interface SessionHandlerOptions {
  supabaseUrl: string;
  supabaseKey: string;
  cookieName: string;
  /** Base URL of apps/api, called server to server. */
  apiUrl: string;
  /** Shared with apps/api (INTERNAL_PROXY_SECRET); lets the API trust the forwarded client IP. */
  proxySecret: string;
  allowedRoles: readonly Role[];
  /**
   * Admin only: cookie for the short-lived password-recovery session (HttpOnly). Enables
   * POST /auth/recovery. Never read by the page guard or the /api proxy.
   */
  recoveryCookieName?: string;
}

const CODE = /^\d{6}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

type Cookie = {
  name: string;
  value: string;
  options: Parameters<NextResponse["cookies"]["set"]>[2];
};

const fail = (status: number, code: string, message: string) =>
  NextResponse.json({ success: false, error: { code, message } }, { status });

// Status and error code only: never emails, codes or tokens.
const logError = (message: string, status?: number, code?: string) =>
  console.error(JSON.stringify({ level: "error", message, status, code }));

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
  const localOwnerSetupWithoutToken =
    process.env.NODE_ENV === "development" &&
    opts.cookieName === ADMIN_SESSION_COOKIE &&
    isLoopbackUrl(opts.supabaseUrl) &&
    isLoopbackUrl(opts.apiUrl);
  const session = (
    req: NextRequest,
    cookieName = opts.cookieName,
    maxAge?: number,
  ) => {
    const pending: Cookie[] = [];
    const client = createServerClient(opts.supabaseUrl, opts.supabaseKey, {
      cookieOptions: sessionCookieOptions(cookieName),
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookies) => {
          pending.push(...cookies);
        },
      },
    });
    const apply = (res: NextResponse) => {
      pending.forEach(({ name, value, options }) =>
        res.cookies.set(
          name,
          value,
          // @supabase/ssr always writes its own 400-day lifetime; a short session overrides it.
          // Removals (empty value, Max-Age 0) are kept as they are.
          maxAge && value
            ? { ...options, maxAge, expires: undefined }
            : options,
        ),
      );
      res.headers.set("cache-control", "private, no-store");
      return res;
    };
    return { client, apply };
  };

  const clientIp = (req: NextRequest) => {
    const ip = trustedClientIp(req.headers);
    if (!ip)
      console.error(
        JSON.stringify({
          level: "error",
          message: "auth.client_ip_unavailable",
        }),
      );
    return ip;
  };

  async function login(req: NextRequest) {
    if (!sameOrigin(req))
      return fail(403, "FORBIDDEN", "Cross-site request refused");
    const ip = clientIp(req);
    if (!ip) return unavailable();
    return signInThroughApi(req, ip, await req.text());
  }

  /**
   * POST /auth/setup (Admin only): one-time Owner registration through apps/api, then signs the new
   * Owner in so the authenticator can be set up at /mfa right away. The session is aal1, so the page
   * guard and the API accept it only for the MFA step. Tokens never reach the browser.
   */
  async function ownerSetup(req: NextRequest) {
    if (opts.cookieName !== ADMIN_SESSION_COOKIE)
      return fail(404, "NOT_FOUND", "Not found");
    if (!sameOrigin(req))
      return fail(403, "FORBIDDEN", "Cross-site request refused");
    const ip = clientIp(req);
    if (!ip) return unavailable();
    const body = await req.text();
    const parsed = (() => {
      try {
        return JSON.parse(body) as { username?: unknown; password?: unknown };
      } catch {
        return null;
      }
    })();
    if (
      typeof parsed?.username !== "string" ||
      typeof parsed.password !== "string"
    )
      return fail(400, "VALIDATION_ERROR", "Invalid request");

    const headers = new Headers({ "content-type": "application/json" });
    const setupToken = req.headers.get("x-setup-token");
    if (setupToken) headers.set("x-setup-token", setupToken);
    else if (localOwnerSetupWithoutToken) {
      if (!isLoopbackHost(req.nextUrl.hostname))
        return fail(403, "FORBIDDEN", "Local Owner setup must use localhost");
      headers.set("x-gunita-proxy-secret", opts.proxySecret);
    }
    const upstream = await fetch(`${opts.apiUrl}/api/setup/owner`, {
      method: "POST",
      headers,
      body,
      cache: "no-store",
    }).catch(() => null);
    if (!upstream) return fail(502, "BAD_GATEWAY", "The API is unreachable");
    const payload = await upstream.json().catch(() => null);
    if (!upstream.ok || !payload?.success)
      return NextResponse.json(
        payload ?? {
          success: false,
          error: { code: "SETUP_FAILED", message: "Owner setup failed" },
        },
        { status: upstream.ok ? 502 : upstream.status },
      );

    const signedIn = await signInThroughApi(
      req,
      ip,
      JSON.stringify({ username: parsed.username, password: parsed.password }),
    );
    if (signedIn.ok) return signedIn;
    return fail(
      502,
      "SIGN_IN_FAILED",
      "The Owner account was created, but signing in failed. Go back and sign in to set up the authenticator.",
    );
  }

  /** Signs in through apps/api and stores the session in the HttpOnly cookie. */
  async function signInThroughApi(req: NextRequest, ip: string, body: string) {
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
          // Owner: the page guard and the API refuse this session until POST /auth/mfa succeeds.
          mfaRequired: needsSecondFactor(
            data.user.app_metadata?.role,
            decodeJwtPayload(payload.data.accessToken)?.aal,
          ),
        },
      }),
    );
  }

  /**
   * POST /auth/mfa, second sign-in step for the Owner (SDS 2.4, 2.8), on the HttpOnly session:
   * - { action: "start" }: "verify" when a TOTP factor is set up; otherwise enrolls a new one and
   *   returns its QR code and secret once (first-time setup, any unfinished setup is replaced).
   * - { action: "verify", code, factorId? }: checks the 6-digit code; on success Supabase upgrades the
   *   session to aal2 and the cookie is rewritten. Tokens never reach the browser.
   */
  async function mfa(req: NextRequest) {
    if (!sameOrigin(req))
      return fail(403, "FORBIDDEN", "Cross-site request refused");
    const body = (await req.json().catch(() => null)) as {
      action?: string;
      code?: string;
      factorId?: string;
    } | null;
    const { client, apply } = session(req);
    const { data: claims } = await client.auth.getClaims();
    if (
      !claims?.claims ||
      !hasRole(claims.claims.app_metadata?.role, opts.allowedRoles)
    )
      return apply(fail(401, "UNAUTHORIZED", "Sign in first"));

    const { data: factors, error } = await client.auth.mfa.listFactors();
    if (error) return apply(unavailable());
    const verified = factors.totp[0];

    if (body?.action === "start") {
      if (verified)
        return apply(
          NextResponse.json({ success: true, data: { step: "verify" } }),
        );
      for (const f of factors.all) {
        if (f.factor_type === "totp" && f.status !== "verified")
          await client.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data: enrolled, error: enrollError } =
        await client.auth.mfa.enroll({
          factorType: "totp",
          friendlyName: `Gunita Kopi Owner ${new Date().toISOString()}`,
        });
      if (enrollError) return apply(unavailable());
      return apply(
        NextResponse.json({
          success: true,
          data: {
            step: "enroll",
            factorId: enrolled.id,
            qrCode: enrolled.totp.qr_code,
            secret: enrolled.totp.secret,
          },
        }),
      );
    }

    if (
      body?.action === "verify" &&
      typeof body.code === "string" &&
      CODE.test(body.code)
    ) {
      // Setup: verify the factor whose QR code the page showed (two starts can race, e.g. a
      // reload or React's double effect in development); otherwise the newest unfinished one.
      const unverified = factors.all
        .filter((f) => f.factor_type === "totp")
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      const factor =
        verified ??
        (typeof body.factorId === "string"
          ? unverified.find((f) => f.id === body.factorId)
          : unverified[0]);
      if (!factor)
        return apply(
          fail(409, "MFA_NOT_STARTED", "Set up the authenticator app first"),
        );
      const { error: verifyError } = await client.auth.mfa.challengeAndVerify({
        factorId: factor.id,
        code: body.code,
      });
      if (verifyError) {
        return apply(
          (verifyError.status ?? 0) === 429 || (verifyError.status ?? 0) >= 500
            ? unavailable()
            : fail(
                400,
                "INVALID_CODE",
                "That code is not valid. Try the current code.",
              ),
        );
      }
      return apply(NextResponse.json({ success: true }));
    }
    return apply(fail(400, "VALIDATION_ERROR", "Invalid request"));
  }

  /**
   * POST /auth/recovery, Owner password recovery by emailed 6-digit code ({{ .Token }}), all on
   * the server so no recovery token reaches page scripts:
   * - { step: "request", email }: same answer whether or not the address has an account.
   * - { step: "verify", email, code }: keeps the recovery session in an HttpOnly cookie that no
   *   page or API call accepts.
   * - { step: "reset", password }: saves the password, then signs out every session of the account
   *   (scope global). The user signs in again, including the second step.
   */
  async function recovery(req: NextRequest) {
    if (!opts.recoveryCookieName) return fail(404, "NOT_FOUND", "Not found");
    if (!sameOrigin(req))
      return fail(403, "FORBIDDEN", "Cross-site request refused");
    const body = (await req.json().catch(() => null)) as {
      step?: string;
      email?: string;
      code?: string;
      password?: string;
    } | null;
    const email =
      typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    // 15 minutes to choose the new password; the cookie is dropped after that.
    const { client, apply } = session(req, opts.recoveryCookieName, 15 * 60);
    const generic = () =>
      fail(
        400,
        "INVALID_CODE",
        "That recovery code is invalid or has expired.",
      );

    if (body?.step === "request" && EMAIL.test(email)) {
      const { error } = await client.auth.resetPasswordForEmail(email);
      if (error?.status === 429)
        return fail(429, "RATE_LIMITED", "Too many requests. Try again later.");
      // Any other failure (for example mail delivery) answers like success: no account probing.
      if (error) logError("auth.recovery_request_failed", error.status);
      return NextResponse.json({ success: true });
    }

    if (
      body?.step === "verify" &&
      EMAIL.test(email) &&
      typeof body.code === "string" &&
      CODE.test(body.code)
    ) {
      const { data, error } = await client.auth.verifyOtp({
        email,
        token: body.code,
        type: "recovery",
      });
      if (error?.status === 429)
        return fail(429, "RATE_LIMITED", "Too many attempts. Try again later.");
      if (error || !data.user) return generic();
      if (!hasRole(data.user.app_metadata?.role, opts.allowedRoles)) {
        // Revoke the recovery session just issued; no cookie is written.
        await client.auth.signOut();
        return generic();
      }
      return apply(NextResponse.json({ success: true }));
    }

    if (body?.step === "reset" && typeof body.password === "string") {
      if (body.password.length < MIN_PASSWORD)
        return fail(
          400,
          "VALIDATION_ERROR",
          `Password must be at least ${MIN_PASSWORD} characters.`,
        );
      const { data } = await client.auth.getUser();
      if (!data.user)
        return apply(
          fail(401, "RECOVERY_EXPIRED", "Start the password reset again."),
        );
      const { error } = await client.auth.updateUser({
        password: body.password,
      });
      if (error) {
        logError("auth.recovery_update_failed", error.status, error.code);
        return apply(
          error.code === "weak_password" || error.code === "same_password"
            ? fail(400, "WEAK_PASSWORD", error.message)
            : fail(
                400,
                "RESET_FAILED",
                "The password could not be changed. Start again.",
              ),
        );
      }
      // Ends the recovery session and any other session of this account.
      const { error: outError } = await client.auth.signOut({
        scope: "global",
      });
      if (outError) await client.auth.signOut({ scope: "local" });
      return apply(NextResponse.json({ success: true }));
    }
    return fail(400, "VALIDATION_ERROR", "Invalid request");
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
    const localOwnerSetupRequest =
      req.method === "POST" &&
      path === "setup/owner" &&
      localOwnerSetupWithoutToken &&
      !req.headers.get("x-setup-token");
    if (localOwnerSetupRequest && !isLoopbackHost(req.nextUrl.hostname)) {
      return fail(
        403,
        "FORBIDDEN",
        "Local Owner setup must use localhost",
      );
    }
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
    if (localOwnerSetupRequest) {
      headers.set("x-gunita-proxy-secret", opts.proxySecret);
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

  return { login, logout, proxy, mfa, recovery, ownerSetup };
}
