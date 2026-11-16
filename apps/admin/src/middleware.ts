import { NextResponse, type NextRequest } from "next/server";
import { resolveRole } from "@/lib/session";
import { USE_MOCKS } from "@/lib/use-mocks";

const REQUIRED_ROLE = "owner_admin";

export function middleware(request: NextRequest) {
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

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
