import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { hasRole, type Role } from "./index";
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
  /** Session cookie path; must match the site's session handlers (POS: "/staff"). */
  cookiePath?: string;
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
      cookieOptions: sessionCookieOptions(opts.cookieName, opts.cookiePath),
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
      // nextUrl keeps the site's basePath (POS: /staff/login, never the Owner's /login).
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "";
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
      const target = request.nextUrl.clone();
      target.pathname = opts.restrictedPath;
      target.search = "";
      const restricted = NextResponse.rewrite(target);
      response.cookies.getAll().forEach((c) => restricted.cookies.set(c));
      return restricted;
    }
    return response;
  };
}
