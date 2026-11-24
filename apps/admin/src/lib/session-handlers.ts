import {
  ADMIN_OTP_COOKIE,
  ADMIN_RECOVERY_COOKIE,
  ADMIN_SESSION_COOKIE,
} from "@gunita/auth";
import {
  createSessionHandlers,
  resolveApiUrl,
} from "@gunita/auth/session-server";
import { env } from "./env";

// Server-side session handlers: the HttpOnly cookie never reaches page scripts.
export const session = createSessionHandlers({
  supabaseUrl: env.supabaseUrl,
  supabaseKey: env.supabaseAnonKey,
  cookieName: ADMIN_SESSION_COOKIE,
  apiUrl: resolveApiUrl(),
  proxySecret: process.env.INTERNAL_PROXY_SECRET ?? "",
  allowedRoles: ["owner_admin"],
  recoveryCookieName: ADMIN_RECOVERY_COOKIE,
  otpCookieName: ADMIN_OTP_COOKIE,
});
