import { CreateEmployeeRequest, EmployeeResponse } from "./schema";
import { AuthenticatedUser } from "@/server/lib/auth";
import { AppError, ConflictError } from "@/server/lib/errors";
import { supabaseAdmin } from "@/server/lib/supabase-admin";
import { logAuditEvent } from "@/server/lib/audit";
import { usernameToAuthEmail } from "@/auth";

/**
 * Owner-only account provisioning (SDS 2.4): no public sign up, the service role key stays here.
 * Creates barista accounts only (the schema rejects other roles): internal Auth email, users.email stays NULL.
 * app_metadata.role lets the Admin/POS sites route by role; the API itself trusts only users.role.
 */
export async function createEmployeeAccount(
  currentUser: AuthenticatedUser,
  data: CreateEmployeeRequest,
): Promise<EmployeeResponse> {
  const { data: created, error: authError } =
    await supabaseAdmin.auth.admin.createUser({
      email: usernameToAuthEmail(data.username),
      password: data.password,
      email_confirm: true,
      app_metadata: { role: data.role },
      user_metadata: { full_name: data.fullName, username: data.username },
    });
  if (authError || !created.user) {
    throw new ConflictError(
      authError?.message ?? "Could not create the sign-in account",
    );
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("users")
    .insert({
      auth_user_id: created.user.id,
      username: data.username,
      full_name: data.fullName,
      role: data.role,
    })
    .select()
    .single();

  if (profileError || !profile) {
    // Roll back so no sign-in exists without a profile.
    await supabaseAdmin.auth.admin.deleteUser(created.user.id);
    if (profileError?.code === "23505") {
      throw new ConflictError(`Username '${data.username}' is already taken`);
    }
    throw new AppError(
      profileError?.message ?? "Could not create the employee profile",
      500,
      "DATABASE_ERROR",
    );
  }

  await logAuditEvent({
    action: "employee.create",
    userId: currentUser.id,
    userRole: currentUser.role,
    resource: "users",
    resourceId: String(profile.user_id),
    details: { username: profile.username, role: profile.role },
  });

  return {
    id: String(profile.user_id),
    authUserId: profile.auth_user_id,
    username: profile.username,
    fullName: profile.full_name,
    role: data.role,
    isActive: profile.status === "active",
    createdAt: profile.date_created,
  };
}
