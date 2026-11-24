import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE } from "@gunita/auth";
import { createAuthMiddleware } from "@gunita/auth/middleware";
import { env } from "./lib/env";
import { BASE_PATH } from "./lib/base-path";
import { resolveRole } from "@/lib/session";
import { USE_MOCKS } from "@/lib/use-mocks";

const REQUIRED_ROLE = "owner_admin";

// Owner portal. Public: sign in (password, then the emailed code), wrong-role notice, session
// routes, password recovery, and the legacy /setup redirect. The session cookie is written only
// after the emailed code is accepted; apps/api and RLS refuse any other Owner session.
const guard = createAuthMiddleware({
  supabaseUrl: env.supabaseUrl,
  supabaseKey: env.supabaseAnonKey,
  cookieName: ADMIN_SESSION_COOKIE,
  allowedRoles: [REQUIRED_ROLE],
  publicPaths: [
    "/login",
    "/restricted",
    "/auth/",
    "/setup",
    "/forgot-password",
    "/robots.txt",
  ],
  restrictedPath: "/restricted",
  cookiePath: BASE_PATH,
});

// Demo mode (NEXT_PUBLIC_USE_MOCKS=true): the role comes from the unsigned mock cookie.
// Never enable in production; real sessions always go through `guard`.
function mockMiddleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public static assets
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname === "/robots.txt"
  ) {
    return NextResponse.next();
  }

  // Public pages
  if (pathname === "/login" || pathname === "/restricted" || pathname === "/setup") {
    return NextResponse.next();
  }

  const role = resolveRole(request, USE_MOCKS);
  if (!role) {
    // nextUrl keeps the /admin basePath.
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (role !== REQUIRED_ROLE) {
    const restricted = request.nextUrl.clone();
    restricted.pathname = "/restricted";
    restricted.search = "";
    return NextResponse.rewrite(restricted);
  }

  return NextResponse.next();
}

export function middleware(request: NextRequest) {
  return USE_MOCKS ? mockMiddleware(request) : guard(request);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
