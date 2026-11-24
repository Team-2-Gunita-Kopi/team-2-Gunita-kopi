import { POS_SESSION_COOKIE } from "@gunita/auth";
import {
  createSessionHandlers,
  resolveApiUrl,
} from "@gunita/auth/session-server";
import { BASE_PATH } from "./base-path";
import { env } from "./env";

// Server-side session handlers: the HttpOnly cookie never reaches page scripts.
export const session = createSessionHandlers({
  supabaseUrl: env.supabaseUrl,
  supabaseKey: env.supabaseAnonKey,
  cookieName: POS_SESSION_COOKIE,
  apiUrl: resolveApiUrl(),
  proxySecret: process.env.INTERNAL_PROXY_SECRET ?? "",
  allowedRoles: ["barista"],
  cookiePath: BASE_PATH,
});
