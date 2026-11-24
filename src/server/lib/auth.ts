import { NextRequest } from "next/server";
import { Role, RoleSchema } from "@/auth";
import { AppError, UnauthorizedError, ForbiddenError } from "./errors";
import { createScopedUserClient } from "./supabase-user";
import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/db-types";

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
 * Unverified JWT payload, read only to start the profile and approval lookups early. Nothing in it
 * is trusted: getUser() and PostgREST both verify the token, and the ids must match.
 */
function peekClaims(
  token: string,
): { sub?: unknown; app_metadata?: { role?: unknown } } | null {
  try {
    return JSON.parse(
      Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"),
    );
  } catch {
    return null;
  }
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
  // RLS policy users_select lets a user read their own profile row.
  const profileOf = (authUserId: string) =>
    scopedClient
      .from("users")
      .select("user_id, role, status")
      .eq("auth_user_id", authUserId)
      .maybeSingle();
  const approvedRole = () => scopedClient.rpc("app_role");

  // Speed: one Supabase round trip instead of three. The token check, the profile read and (for an
  // Owner token) the approval check run together; their results are used only after getUser()
  // accepts the token and its user id matches the one the early lookups used.
  const claims = peekClaims(token);
  const hintedId = typeof claims?.sub === "string" ? claims.sub : null;
  const [authResult, earlyProfile, earlyRole] = await Promise.all([
    scopedClient.auth.getUser(token),
    hintedId ? profileOf(hintedId) : null,
    claims?.app_metadata?.role === "owner_admin" ? approvedRole() : null,
  ]);
  const { data: authData, error: authError } = authResult;
  if (authError || !authData.user) {
    throw new UnauthorizedError("Invalid or expired authentication token");
  }

  const { data: profile, error: profileError } =
    earlyProfile && hintedId === authData.user.id
      ? earlyProfile
      : await profileOf(authData.user.id);
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
  // An Owner session counts only after the emailed code (SDS 2.4): app_role() returns the role only
  // for a session apps/api approved, so the database and this check apply the same rule.
  if (role.data === "owner_admin") {
    const { data: dbRole, error: roleError } =
      earlyRole && hintedId === authData.user.id
        ? earlyRole
        : await approvedRole();
    if (roleError) throw new AppError(roleError.message, 500, "DATABASE_ERROR");
    if (dbRole !== "owner_admin") {
      throw new AppError(
        "Complete the second sign-in step first",
        403,
        "MFA_REQUIRED",
      );
    }
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
    // Role names stay in the server log, never in the response.
    console.warn(
      JSON.stringify({
        level: "warn",
        message: "auth.role_denied",
        role: user.role,
        required: allowed,
      }),
    );
    throw new ForbiddenError("You do not have access to this resource");
  }

  return user;
}
