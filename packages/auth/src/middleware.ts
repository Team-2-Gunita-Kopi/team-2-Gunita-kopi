import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { hasRole, needsSecondFactor, type Role } from "./index";
import { sessionCookieOptions } from "./cookies";

export interface AuthMiddlewareOptions {
  supabaseUrl: string;
  supabaseKey: string;
  /** Session cookie name. Admin and POS use different names so they never share a session. */
  cookieName: string;
  allowedRoles: readonly Role[];
  /** Exact paths, or prefixes ending in "/", that need no session. */
  publicPaths: readonly string[];
  /** Signed in with the wrong role: show this page (rewrite) instead of redirecting to /login. */
  restrictedPath?: string;
  /**
   * Second sign-in step page (Admin: "/mfa"). An Owner session below aal2 may open only this page;
   * every other page redirects here. Without it, sessions are accepted at any assurance level.
   */
  mfaPath?: string;
}

/**
 * Route guard for the Admin and POS sites (Next.js middleware).
 * Reads the HttpOnly @supabase/ssr session cookie, refreshes an expired access token,
 * and verifies the JWT (getClaims: local check with asymmetric keys, otherwise Supabase Auth).
 * app_metadata.role only decides page routing; the API re-checks role and status on every call.
 */
export function createAuthMiddleware(opts: AuthMiddlewareOptions) {
  const isPublic = (path: string) =>
    opts.publicPaths.some((p) =>
      p.endsWith("/") ? path.startsWith(p) : path === p,
    );

  return async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;
    if (isPublic(pathname)) return NextResponse.next();

    let response = NextResponse.next({ request });
    const supabase = createServerClient(opts.supabaseUrl, opts.supabaseKey, {
      cookieOptions: sessionCookieOptions(opts.cookieName),
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies, headers) => {
          cookies.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookies.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers ?? {}).forEach(([k, v]) =>
            response.headers.set(k, v),
          );
        },
      },
    });

    const { data } = await supabase.auth.getClaims();

    const redirectToLogin = (param: string, value: string) => {
      const url = new URL("/login", request.url);
      url.searchParams.set(param, value);
      const redirect = NextResponse.redirect(url);
      // Keep cookie updates (refresh or removal) made while checking the session.
      response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
      return redirect;
    };

    if (!data?.claims) return redirectToLogin("redirect", pathname);
    if (!hasRole(data.claims.app_metadata?.role, opts.allowedRoles)) {
      if (!opts.restrictedPath) {
        return redirectToLogin("error", "unauthorized_role");
      }
      const restricted = NextResponse.rewrite(
        new URL(opts.restrictedPath, request.url),
      );
      response.cookies.getAll().forEach((c) => restricted.cookies.set(c));
      return restricted;
    }
    if (
      opts.mfaPath &&
      pathname !== opts.mfaPath &&
      needsSecondFactor(data.claims.app_metadata?.role, data.claims.aal)
    ) {
      const url = new URL(opts.mfaPath, request.url);
      url.searchParams.set("redirect", pathname);
      const redirect = NextResponse.redirect(url);
      response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
      return redirect;
    }
    return response;
  };
}
