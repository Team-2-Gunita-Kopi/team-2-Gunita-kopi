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
  /**
   * Admin only: cookie for the short-lived password-recovery session (HttpOnly). Enables
   * POST /auth/recovery. Never read by the page guard or the /api proxy.
   */
  recoveryCookieName?: string;
  /**
   * Admin only: HttpOnly cookie holding the Owner's sign-in challenge between the password and the
   * emailed code. Enables POST /auth/otp. Without it (POS), Owner accounts are refused at sign-in.
   */
  otpCookieName?: string;
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

    if (payload.data?.otpRequired) return startOtp(payload.data.challenge);
    return storeSession(req, payload.data);
  }

  /** Writes the session from apps/api into the HttpOnly cookie, for an allowed role only. */
  async function storeSession(
    req: NextRequest,
    tokens: { accessToken: string; refreshToken: string },
  ) {
    const { client, apply } = session(req);
    const { data, error } = await client.auth.setSession({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
    });
    if (error || !data.user) {
      // Usually this site's Supabase URL or publishable key differs from apps/api's.
      logError("auth.store_session_failed", error?.status, error?.code);
      return fail(502, "AUTH_ERROR", "Sign-in failed");
    }
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

  const otpApi = async (body: Record<string, unknown>) => {
    const upstream = await fetch(`${opts.apiUrl}/api/auth/otp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    }).catch(() => null);
    const payload = upstream ? await upstream.json().catch(() => null) : null;
    const ok = !!upstream?.ok && payload?.success === true;
    const error = () =>
      payload && upstream && !upstream.ok
        ? NextResponse.json(payload, { status: upstream.status })
        : unavailable();
    return { ok, payload, error };
  };

  const otpCookie = (res: NextResponse, value: string) => {
    res.cookies.set(opts.otpCookieName!, value, {
      path: "/auth",
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      maxAge: value ? 10 * 60 : 0,
    });
    res.headers.set("cache-control", "private, no-store");
    return res;
  };

  /** Owner after the password: no session yet. Emails the first code and keeps the challenge. */
  async function startOtp(challenge: string) {
    if (!opts.otpCookieName)
      return fail(403, "FORBIDDEN", "This account cannot use this site");
    const sent = await otpApi({ action: "send", challenge });
    if (!sent.ok) return sent.error();
    return otpCookie(
      NextResponse.json({ success: true, data: { otpRequired: true } }),
      challenge,
    );
  }

  /**
   * POST /auth/otp (Admin), second Owner sign-in step, on the HttpOnly challenge cookie:
   * - { action: "verify", code }: apps/api checks the emailed code and approves the new session,
   *   which is then written to the session cookie. Tokens never reach the browser.
   * - { action: "resend" }: emails a new code (apps/api enforces the limits).
   */
  async function otp(req: NextRequest) {
    if (!opts.otpCookieName) return fail(404, "NOT_FOUND", "Not found");
    if (!sameOrigin(req))
      return fail(403, "FORBIDDEN", "Cross-site request refused");
    const challenge = req.cookies.get(opts.otpCookieName)?.value;
    if (!challenge)
      return fail(401, "OTP_EXPIRED", "The code has expired. Sign in again.");
    const body = (await req.json().catch(() => null)) as {
      action?: string;
      code?: unknown;
    } | null;

    if (body?.action === "resend") {
      const sent = await otpApi({ action: "send", challenge });
      return sent.ok ? NextResponse.json({ success: true }) : sent.error();
    }
    if (
      body?.action !== "verify" ||
      typeof body.code !== "string" ||
      !CODE.test(body.code)
    )
      return fail(400, "VALIDATION_ERROR", "Enter the 6-digit code");

    const verified = await otpApi({
      action: "verify",
      challenge,
      code: body.code,
    });
    if (!verified.ok) {
      // A used-up challenge: drop the cookie so the page returns to the password step.
      const code = verified.payload?.error?.code;
      return code === "OTP_EXPIRED" || code === "OTP_LIMIT"
        ? otpCookie(verified.error(), "")
        : verified.error();
    }
    return otpCookie(await storeSession(req, verified.payload.data), "");
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
    // Tokens must never reach the browser: sign-in goes through /auth/* only. Owner setup is a
    // developer script against apps/api, never through a site.
    if (path.startsWith("auth/") || path.startsWith("setup/"))
      return fail(404, "NOT_FOUND", "Not found");
    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    if (hasBody && !sameOrigin(req))
      return fail(403, "FORBIDDEN", "Cross-site request refused");

    const { client, apply } = session(req);
    // Reads the cookie and refreshes an expiring token; apps/api verifies the token itself.
    const { data } = await client.auth.getSession();
    const headers = new Headers();
    for (const h of ["content-type", "x-request-id"]) {
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

  return { login, logout, proxy, otp, recovery };
}
