import { POS_SESSION_COOKIE } from "@/auth";
import { createSessionHandlers } from "@/auth/session-server";
import { dispatchApi } from "@/server/dispatch";
import { BASE_PATH } from "./base-path";
import { env } from "./env";

// Server-side session handlers: the HttpOnly cookie never reaches page scripts.
export const session = createSessionHandlers({
  supabaseUrl: env.supabaseUrl,
  supabaseKey: env.supabaseAnonKey,
  cookieName: POS_SESSION_COOKIE,
  // The backend runs in this app: calls are dispatched in process, never over the network.
  callApi: dispatchApi,
  proxySecret: process.env.INTERNAL_PROXY_SECRET ?? "",
  allowedRoles: ["barista"],
  cookiePath: BASE_PATH,
});
