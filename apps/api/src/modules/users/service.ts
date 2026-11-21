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
 * Name, active status and password; the database grants no update on role, username, email or the
 * Auth link. A deactivated user is refused on their next API call (requireUser checks status).
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
  const { password, ...fields } = body;
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
    // Password only: still confirm the Owner can see this account before touching Auth.
    profile = await getUser(user, id);
  }
  if (password !== undefined) await setPassword(id, password);
  // Never write the password itself to the audit log.
  await auditAction(user, "user.update", "users", id, password === undefined ? fields : { ...fields, passwordChanged: true });
  return profile;
}

/** Owner-set password: Supabase Auth admin API (service role), keyed by the profile's Auth link. */
async function setPassword(id: number, password: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("auth_user_id")
    .eq("user_id", id)
    .maybeSingle();
  if (error) throw dbError(error);
  if (!data?.auth_user_id) throw new NotFoundError("User not found");
  const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(data.auth_user_id, { password });
  if (authError) throw new AppError(authError.message, 400, "VALIDATION");
}
