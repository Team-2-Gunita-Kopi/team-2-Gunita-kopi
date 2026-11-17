import { NextRequest } from "next/server";
import { Role, RoleSchema } from "@gunita/auth";
import { AppError, UnauthorizedError, ForbiddenError } from "./errors";
import { createScopedUserClient } from "./supabase-user";
import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@gunita/db-types";

export interface AuthenticatedUser {
  /** Supabase Auth user id (uuid). */
  id: string;
  /** users.user_id, used for orders, payments and stock attribution. */
  userId: number;
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
 * Requires a valid user session. Verifies the token with Supabase Auth (signature and expiry),
 * then reads role and status from the users table: token claims are never trusted for authorization.
 * Returns a scoped Supabase client with the user's token so RLS applies.
 */
export async function requireUser(
  req: NextRequest | Request,
): Promise<AuthenticatedUser> {
  const token = getBearerToken(req);
  if (!token) {
    throw new UnauthorizedError("Missing Bearer authentication token");
  }

  const scopedClient = createScopedUserClient(token);

  const { data: authData, error: authError } =
    await scopedClient.auth.getUser(token);
  if (authError || !authData.user) {
    throw new UnauthorizedError("Invalid or expired authentication token");
  }

  // RLS policy users_select lets a user read their own profile row.
  const { data: profile, error: profileError } = await scopedClient
    .from("users")
    .select("user_id, role, status")
    .eq("auth_user_id", authData.user.id)
    .maybeSingle();
  if (profileError) {
    throw new AppError(profileError.message, 500, "DATABASE_ERROR");
  }
  if (!profile || profile.status !== "active") {
    throw new ForbiddenError("Account has no active employee profile");
  }
  const role = RoleSchema.safeParse(profile.role);
  if (!role.success) {
    throw new ForbiddenError("Account has an unrecognized role");
  }

  return {
    id: authData.user.id,
    userId: profile.user_id,
    email: authData.user.email ?? "",
    role: role.data,
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
