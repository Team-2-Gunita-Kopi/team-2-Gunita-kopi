import { createBrowserClient } from "@supabase/ssr";
import { ADMIN_RECOVERY_COOKIE } from "@gunita/auth";
import { env } from "./env";

/**
 * Browser Supabase client used only by the password-recovery pages (forgot/reset password).
 * Its short-lived recovery session uses its own cookie; the sign-in session is HttpOnly and
 * handled by the server (/auth/login, /auth/logout, /api proxy).
 * Never used for direct database access or queries.
 */
export const supabaseBrowser = createBrowserClient(
  env.supabaseUrl,
  env.supabaseAnonKey,
  {
    cookieOptions: {
      name: ADMIN_RECOVERY_COOKIE,
      secure: process.env.NODE_ENV === "production",
    },
  },
);
