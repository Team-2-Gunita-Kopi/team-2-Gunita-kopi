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
 * Name and active status only; the database grants no update on role, username, email or the
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
  const { data, error } = await user.supabaseClient
    .from("users")
    .update({ full_name: body.fullName, status: body.status })
    .eq("user_id", id)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new NotFoundError("User not found");
  await auditAction(user, "user.update", "users", id, body);
  return toProfile(data);
}
