import { POS_SESSION_COOKIE } from "@gunita/auth";
import { createAuthMiddleware } from "@gunita/auth/middleware";
import { env } from "./lib/env";

// Barista terminal (owner_admin also allowed for cross-testing). PWA assets stay public.
export const middleware = createAuthMiddleware({
  supabaseUrl: env.supabaseUrl,
  supabaseKey: env.supabaseAnonKey,
  cookieName: POS_SESSION_COOKIE,
  allowedRoles: ["barista", "owner_admin"],
  publicPaths: [
    "/login",
    "/auth/",
    "/robots.txt",
    "/manifest.webmanifest",
    "/manifest.json",
    "/sw.js",
    "/icons/",
  ],
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
