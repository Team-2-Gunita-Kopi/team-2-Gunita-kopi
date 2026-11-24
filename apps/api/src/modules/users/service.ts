import type {
  Page,
  Role,
  Status,
  UpdateUserRequest,
  UserListQuery,
  UserProfile,
} from "@gunita/contracts";
import type { Tables } from "@gunita/db-types";
import { AuthenticatedUser } from "@/lib/auth";
import { AppError, dbError, NotFoundError } from "@/lib/errors";
import { pageRange, toPage } from "@/lib/request";
import { auditAction } from "@/lib/audit";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createAuthClient } from "@/lib/supabase-user";
import { logger } from "@/lib/logger";
import { usernameToAuthEmail } from "@gunita/auth";

const COLUMNS =
  "user_id, username, full_name, role, status, email, date_created";

const toProfile = (
  r: Pick<
    Tables<"users">,
    | "user_id"
    | "username"
    | "full_name"
    | "role"
    | "status"
    | "email"
    | "date_created"
  >,
): UserProfile => ({
  id: r.user_id,
  username: r.username,
  fullName: r.full_name,
  role: r.role as Role,
  status: r.status as Status,
  email: r.email,
  createdAt: r.date_created,
});

/** Owner only (RLS also shows the Owner every row). Accounts are created by POST /api/admin/employees. */
export async function listUsers(
  user: AuthenticatedUser,
  q: UserListQuery,
): Promise<Page<UserProfile>> {
  let query = user.supabaseClient
    .from("users")
    .select(COLUMNS, { count: "exact" })
    .order("full_name")
    .range(...pageRange(q));
  if (q.role) query = query.eq("role", q.role);
  if (q.status) query = query.eq("status", q.status);
  const { data, error, count } = await query;
  if (error) throw dbError(error);
  return toPage(data.map(toProfile), count, q);
}

export async function getUser(
  user: AuthenticatedUser,
  id: number,
): Promise<UserProfile> {
  const { data, error } = await user.supabaseClient
    .from("users")
    .select(COLUMNS)
    .eq("user_id", id)
    .maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new NotFoundError("User not found");
  return toProfile(data);
}

/**
 * Name, username, active status and password. Role, email and the Auth link never change here.
 * A deactivated user is refused on their next API call (requireUser checks status).
 */
export async function updateUser(
  user: AuthenticatedUser,
  id: number,
  body: UpdateUserRequest,
): Promise<UserProfile> {
  if (id === user.userId && body.status === "inactive") {
    throw new AppError(
      "You cannot deactivate your own account",
      400,
      "VALIDATION",
    );
  }
  const { password, currentPassword, username, ...fields } = body;
  // Own password: the current one first, so an open session alone cannot take the account over.
  if (password !== undefined && id === user.userId)
    await checkCurrentPassword(id, currentPassword);
  let profile: UserProfile;
  if (fields.fullName !== undefined || fields.status !== undefined) {
    const { data, error } = await user.supabaseClient
      .from("users")
      .update({ full_name: fields.fullName, status: fields.status })
      .eq("user_id", id)
      .select(COLUMNS)
      .maybeSingle();
    if (error) throw dbError(error);
    if (!data) throw new NotFoundError("User not found");
    profile = toProfile(data);
  } else {
    // No profile field: still confirm the Owner can see this account before touching Auth.
    profile = await getUser(user, id);
  }
  const renamed = username !== undefined && username !== profile.username;
  if (renamed) {
    // Signed-in users have no UPDATE grant on username; the unique index refuses a taken name (409).
    const { data, error } = await supabaseAdmin
      .from("users")
      .update({ username })
      .eq("user_id", id)
      .select(COLUMNS)
      .maybeSingle();
    if (error) throw dbError(error);
    if (!data) throw new NotFoundError("User not found");
    profile = toProfile(data);
  }
  if (password !== undefined) await setPassword(id, password);
  if (renamed || fields.fullName !== undefined) await syncAuthProfile(id, profile, renamed);
  // Never write a password to the audit log.
  await auditAction(user, "user.update", "users", id, {
    ...fields,
    ...(renamed ? { username } : {}),
    ...(password !== undefined ? { passwordChanged: true } : {}),
  });
  return profile;
}

async function authUserId(id: number): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("auth_user_id")
    .eq("user_id", id)
    .maybeSingle();
  if (error) throw dbError(error);
  if (!data?.auth_user_id) throw new NotFoundError("User not found");
  return data.auth_user_id;
}

/** Owner-set password: Supabase Auth admin API (service role), keyed by the profile's Auth link. */
async function setPassword(id: number, password: string): Promise<void> {
  const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(await authUserId(id), { password });
  if (authError) throw new AppError(authError.message, 400, "VALIDATION");
}

/** Checks the account's current password with Supabase Auth, then revokes that check's session. */
async function checkCurrentPassword(id: number, current: string | undefined): Promise<void> {
  if (!current) throw new AppError("Enter your current password", 400, "VALIDATION");
  const { data: linked, error } = await supabaseAdmin.auth.admin.getUserById(await authUserId(id));
  if (error || !linked.user?.email) throw new AppError("Password check is unavailable", 503, "SERVICE_UNAVAILABLE");
  const { data, error: signInError } = await createAuthClient().auth.signInWithPassword({
    email: linked.user.email,
    password: current,
  });
  if (signInError || !data.session) {
    const status = signInError?.status ?? 0;
    if (status === 429 || status >= 500)
      throw new AppError("Password check is unavailable", 503, "SERVICE_UNAVAILABLE");
    throw new AppError("Current password is incorrect", 400, "INVALID_CURRENT_PASSWORD");
  }
  await supabaseAdmin.auth.admin.signOut(data.session.access_token, "local");
}

/**
 * Keeps the Auth account's display details (and a Barista's internal email) in step with the
 * profile. Sign-in uses the linked Auth email, so a failure here is logged, not fatal.
 */
async function syncAuthProfile(id: number, profile: UserProfile, renamed: boolean): Promise<void> {
  const { error } = await supabaseAdmin.auth.admin.updateUserById(await authUserId(id), {
    user_metadata: { username: profile.username, full_name: profile.fullName },
    ...(renamed && profile.role === "barista"
      ? { email: usernameToAuthEmail(profile.username), email_confirm: true }
      : {}),
  });
  if (error) logger.error("users.auth_profile_sync_failed", { status: error.status });
}
