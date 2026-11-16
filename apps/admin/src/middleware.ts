import { NextResponse, type NextRequest } from "next/server";
import { extractRoleFromToken, isOwnerAdmin } from "@gunita/auth";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public static assets and robots.txt
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname === "/robots.txt"
  ) {
    return NextResponse.next();
  }

  // Allow login page
  if (pathname === "/login") {
    return NextResponse.next();
  }

  // Look for Supabase auth cookie or header
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

  // Redirect to login if unauthenticated
  if (!accessToken) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Check role: must be owner_admin
  const role = extractRoleFromToken(accessToken);
  if (!isOwnerAdmin(role)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "unauthorized_role");
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
