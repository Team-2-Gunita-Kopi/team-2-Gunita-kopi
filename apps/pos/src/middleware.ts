import { NextResponse, type NextRequest } from "next/server";
import { POS_SESSION_COOKIE } from "@gunita/auth";
import { createAuthMiddleware } from "@gunita/auth/middleware";
import { env } from "./lib/env";
import { BASE_PATH } from "./lib/base-path";
import { resolveRole } from "@/lib/session";
import { USE_MOCKS } from "@/lib/use-mocks";

const REQUIRED_ROLE = "barista";

// Barista terminal. PWA assets, sign in, wrong-role notice and session routes stay public.
const guard = createAuthMiddleware({
  supabaseUrl: env.supabaseUrl,
  supabaseKey: env.supabaseAnonKey,
  cookieName: POS_SESSION_COOKIE,
  allowedRoles: [REQUIRED_ROLE],
  publicPaths: [
    "/login",
    "/restricted",
    "/auth/",
    "/robots.txt",
    "/manifest.webmanifest",
    "/manifest.json",
    "/sw.js",
    "/icons/",
  ],
  restrictedPath: "/restricted",
  cookiePath: BASE_PATH,
});

// Demo mode (NEXT_PUBLIC_USE_MOCKS=true): the role comes from the unsigned mock cookie.
// Never enable in production; real sessions always go through `guard`.
function mockMiddleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public static assets, manifest, icons and the service worker
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname === "/robots.txt" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/manifest.json" ||
    pathname === "/sw.js" ||
    pathname.startsWith("/icons/")
  ) {
    return NextResponse.next();
  }

  // Public pages
  if (pathname === "/login" || pathname === "/restricted") {
    return NextResponse.next();
  }

  const role = resolveRole(request, USE_MOCKS);
  if (!role) {
    // nextUrl keeps the /staff basePath.
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
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
