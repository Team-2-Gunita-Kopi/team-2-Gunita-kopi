import { ADMIN_SESSION_COOKIE } from "@gunita/auth";
import { createAuthMiddleware } from "@gunita/auth/middleware";
import { env } from "./lib/env";

// Owner portal: owner_admin only. Public: sign in, one-time Owner setup, password recovery.
export const middleware = createAuthMiddleware({
  supabaseUrl: env.supabaseUrl,
  supabaseKey: env.supabaseAnonKey,
  cookieName: ADMIN_SESSION_COOKIE,
  allowedRoles: ["owner_admin"],
  publicPaths: [
    "/login",
    "/auth/",
    "/setup",
    "/forgot-password",
    "/reset-password",
    "/robots.txt",
  ],
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
