import { NextRequest } from "next/server";
import {
  Role,
  extractRoleFromToken,
  extractUserIdFromToken,
  extractEmailFromToken,
} from "@gunita/auth";
import { UnauthorizedError, ForbiddenError } from "./errors";
import { createScopedUserClient } from "./supabase-user";
import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@gunita/db-types";

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
  token: string;
  supabaseClient: SupabaseClient<Database>;
}

/**
 * Extracts Bearer token from Request Authorization header.
 */
export function getBearerToken(req: NextRequest | Request): string | null {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.substring(7).trim();
}

/**
 * Requires a valid user session. Verifies token and returns AuthenticatedUser.
 * Creates a scoped Supabase client with the user's token so RLS applies.
 */
export async function requireUser(
  req: NextRequest | Request,
): Promise<AuthenticatedUser> {
  const token = getBearerToken(req);
  if (!token) {
    throw new UnauthorizedError("Missing Bearer authentication token");
  }

  const userId = extractUserIdFromToken(token);
  const email = extractEmailFromToken(token) || "unknown@gunitakopi.com";
  const role = extractRoleFromToken(token);

  if (!userId || !role) {
    throw new UnauthorizedError(
      "Invalid or expired authentication token claims",
    );
  }

  const scopedClient = createScopedUserClient(token);

  return {
    id: userId,
    email,
    role,
    token,
    supabaseClient: scopedClient,
  };
}

/**
 * Requires user to have one of the allowed roles.
 * Throws ForbiddenError if user role is insufficient.
 */
export async function requireRole(
  req: NextRequest | Request,
  allowedRoles: Role | readonly Role[],
): Promise<AuthenticatedUser> {
  const user = await requireUser(req);
  const allowed = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  if (!allowed.includes(user.role)) {
    throw new ForbiddenError(
      `Access denied: role '${user.role}' is not authorized for this resource. Required: ${allowed.join(" or ")}`,
    );
  }

  return user;
}
