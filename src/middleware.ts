import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE, POS_SESSION_COOKIE, type Role } from "@/auth";
import { createAuthMiddleware } from "@/auth/middleware";
import { env } from "@/owner/lib/env";
import { USE_MOCKS } from "@/owner/lib/use-mocks";
import { resolveRole } from "@/owner/lib/session";

// One app, two separate areas. Each area has its own sign-in page, its own session cookie (scoped to
// its prefix) and its own allowed role. The API (src/server) re-checks role and status on every call.
interface Area {
  prefix: "/admin" | "/staff";
  role: Role;
  cookieName: string;
  publicPaths: readonly string[];
}

const OWNER: Area = {
  prefix: "/admin",
  role: "owner_admin",
  cookieName: ADMIN_SESSION_COOKIE,
  // Sign-in, wrong-role notice, session routes, password recovery and the legacy /setup redirect.
  publicPaths: ["/admin/login", "/admin/restricted", "/admin/auth/", "/admin/setup", "/admin/forgot-password"],
};
const STAFF: Area = {
  prefix: "/staff",
  role: "barista",
  cookieName: POS_SESSION_COOKIE,
  // PWA assets, sign-in, wrong-role notice and session routes.
  publicPaths: [
    "/staff/login",
    "/staff/restricted",
    "/staff/auth/",
    "/staff/manifest.webmanifest",
    "/staff/sw.js",
    "/staff/icons/",
  ],
};

const guards = new Map(
  [OWNER, STAFF].map((a) => [
    a.prefix,
    createAuthMiddleware({
      supabaseUrl: env.supabaseUrl,
      supabaseKey: env.supabaseAnonKey,
      cookieName: a.cookieName,
      allowedRoles: [a.role],
      publicPaths: a.publicPaths,
      loginPath: `${a.prefix}/login`,
      restrictedPath: `${a.prefix}/restricted`,
      cookiePath: a.prefix,
    }),
  ]),
);

const isPublic = (path: string, publicPaths: readonly string[]) =>
  publicPaths.some((p) => (p.endsWith("/") ? path.startsWith(p) : path === p));

// Demo mode (NEXT_PUBLIC_USE_MOCKS=true): the role comes from the unsigned mock cookie.
// Never enable in production; real sessions always go through the guards above.
function demoGuard(request: NextRequest, area: Area) {
  const { pathname } = request.nextUrl;
  if (isPublic(pathname, area.publicPaths)) return NextResponse.next();
  const role = resolveRole(request, USE_MOCKS);
  if (!role) {
    const login = request.nextUrl.clone();
    login.pathname = `${area.prefix}/login`;
    login.search = "";
    login.searchParams.set("redirect", pathname);
    return NextResponse.redirect(login);
  }
  if (role !== area.role) {
    const restricted = request.nextUrl.clone();
    restricted.pathname = `${area.prefix}/restricted`;
    restricted.search = "";
    return NextResponse.rewrite(restricted);
  }
  return NextResponse.next();
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const area = pathname.startsWith("/admin") ? OWNER : pathname.startsWith("/staff") ? STAFF : null;
  if (!area) return NextResponse.next();
  // The /api proxies answer with JSON 401/403 themselves; the app icon (Next serves it as
  // icon-<hash>.svg) must load on sign-in pages.
  if (pathname.startsWith(`${area.prefix}/api/`) || /^\/(admin|staff)\/icon(-\w+)?\.svg$/.test(pathname)) {
    return NextResponse.next();
  }
  return USE_MOCKS ? demoGuard(request, area) : guards.get(area.prefix)!(request);
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/staff", "/staff/:path*"],
};
