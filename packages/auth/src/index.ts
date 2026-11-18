import { Role, ROLES, RoleSchema } from "@gunita/contracts";

export type { Role };
export { ROLES, RoleSchema };

/**
 * Staff sign in with a username, but Supabase Auth needs an email.
 * Barista accounts get this internal address; no mail is ever sent to it.
 * The Owner/Admin uses a real email instead (users.email).
 * Used only by the API: account creation and POST /api/auth/login.
 */
export const STAFF_EMAIL_DOMAIN = "staff.gunitakopi.local";

/**
 * Session cookie names (@supabase/ssr, HttpOnly, set by each site's server). Different per site so
 * Admin and POS on one host (localhost:3000 and :3001 share cookies) never overwrite each other.
 */
export const ADMIN_SESSION_COOKIE = "sb-gunita-admin-auth";
export const POS_SESSION_COOKIE = "sb-gunita-pos-auth";
/** Short-lived browser session used only by the Admin password-recovery pages. */
export const ADMIN_RECOVERY_COOKIE = "sb-gunita-admin-recovery";

export function usernameToAuthEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${STAFF_EMAIL_DOMAIN}`;
}

export interface SupabaseJwtPayload {
  sub: string;
  email?: string;
  app_metadata?: {
    role?: string;
    provider?: string;
    providers?: string[];
    [key: string]: unknown;
  };
  user_metadata?: {
    full_name?: string;
    name?: string;
    [key: string]: unknown;
  };
  role?: string;
  exp?: number;
  iat?: number;
}

/**
 * Type guard for the owner_admin role.
 */
export function isOwnerAdmin(role: unknown): role is "owner_admin" {
  return role === ROLES.OWNER_ADMIN;
}

/**
 * Type guard for the barista role.
 */
export function isBarista(role: unknown): role is "barista" {
  return role === ROLES.BARISTA;
}

/**
 * Checks if a given role matches any of the allowed roles.
 */
export function hasRole(
  role: unknown,
  allowed: Role | readonly Role[],
): boolean {
  if (typeof role !== "string") return false;
  const allowedList = Array.isArray(allowed) ? allowed : [allowed];
  return allowedList.includes(role as Role);
}

/**
 * Safely decodes base64url payload of a JWT without verifying signature.
 * Used on client and server to read claims (API always verifies with Supabase server).
 */
export function decodeJwtPayload(token: string): SupabaseJwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const base64Url = parts[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload =
      typeof atob === "function"
        ? atob(base64)
        : Buffer.from(base64, "base64").toString("utf-8");
    return JSON.parse(jsonPayload) as SupabaseJwtPayload;
  } catch {
    return null;
  }
}

/**
 * Extracts the user role from Supabase app_metadata stored in the JWT token.
 * Returns null if token is invalid or does not have a recognized Gunita role.
 */
export function extractRoleFromToken(token: string): Role | null {
  const payload = decodeJwtPayload(token);
  if (!payload?.app_metadata?.role) return null;
  const role = payload.app_metadata.role;
  return role === ROLES.OWNER_ADMIN || role === ROLES.BARISTA ? role : null;
}

/**
 * Extracts user ID (sub claim) from token.
 */
export function extractUserIdFromToken(token: string): string | null {
  const payload = decodeJwtPayload(token);
  return payload?.sub ?? null;
}

/**
 * Extracts user email from token.
 */
export function extractEmailFromToken(token: string): string | null {
  const payload = decodeJwtPayload(token);
  return payload?.email ?? null;
}

export {
  MOCK_SESSION_COOKIE,
  encodeMockSession,
  decodeMockSession,
  type MockSession,
} from "./mock-session";
