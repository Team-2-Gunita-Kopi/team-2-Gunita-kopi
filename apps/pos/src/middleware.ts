import { NextResponse, type NextRequest } from "next/server";
import { extractRoleFromToken, isBarista, isOwnerAdmin } from "@gunita/auth";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow static assets, manifest, icons, and service worker
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

  // Allow login page
  if (pathname === "/login") {
    return NextResponse.next();
  }

  // Check auth cookie or header
  const cookies = request.cookies.getAll();
  let accessToken: string | null = null;

  for (const cookie of cookies) {
    if (cookie.name.includes("-auth-token")) {
      try {
        const parsed = JSON.parse(cookie.value);
        if (Array.isArray(parsed) && parsed[0]) {
          accessToken = parsed[0];
        } else if (parsed?.access_token) {
          accessToken = parsed.access_token;
        }
      } catch {
        accessToken = cookie.value;
      }
      break;
    }
  }

  if (!accessToken) {
    const authHeader = request.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      accessToken = authHeader.substring(7);
    }
  }

  if (!accessToken) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Require barista role (or owner_admin during cross-testing)
  const role = extractRoleFromToken(accessToken);
  if (!isBarista(role) && !isOwnerAdmin(role)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "unauthorized_role");
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
