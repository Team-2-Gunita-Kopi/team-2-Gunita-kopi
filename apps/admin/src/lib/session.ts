import { ADMIN_SESSION_COOKIE } from "@gunita/auth";
import { createSessionHandlers } from "@gunita/auth/session-server";
import { env } from "./env";

// Server-side session handlers: the HttpOnly cookie never reaches page scripts.
export const session = createSessionHandlers({
  supabaseUrl: env.supabaseUrl,
  supabaseKey: env.supabaseAnonKey,
  cookieName: ADMIN_SESSION_COOKIE,
  apiUrl: process.env.API_URL || env.apiUrl,
  proxySecret: process.env.INTERNAL_PROXY_SECRET ?? "",
  allowedRoles: ["owner_admin"],
});
