import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE } from "@gunita/auth";
import { createAuthMiddleware } from "@gunita/auth/middleware";
import { env } from "./lib/env";
import { resolveRole } from "@/lib/session";
import { USE_MOCKS } from "@/lib/use-mocks";

const REQUIRED_ROLE = "owner_admin";

// Owner portal. Public: sign in, wrong-role notice, session routes, one-time Owner setup,
// password recovery. /mfa needs a signed-in Owner; every other page needs the second step (aal2).
const guard = createAuthMiddleware({
  mfaPath: "/mfa",
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
  if (pathname === "/login" || pathname === "/restricted") {
    return NextResponse.next();
  }

  const role = resolveRole(request, USE_MOCKS);
  if (!role) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (role !== REQUIRED_ROLE) {
    return NextResponse.rewrite(new URL("/restricted", request.url));
  }

  return NextResponse.next();
}

export function middleware(request: NextRequest) {
  return USE_MOCKS ? mockMiddleware(request) : guard(request);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
