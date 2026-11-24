import { createHash, timingSafeEqual } from "node:crypto";
import {
  OwnerSetupRequest,
  OwnerSetupResponse,
  STAFF_EMAIL_DOMAIN,
} from "./schema";
import {
  AppError,
  ConflictError,
  ForbiddenError,
  UnauthorizedError,
} from "@/lib/errors";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logAuditEvent } from "@/lib/audit";
import { logger } from "@/lib/logger";

/**
 * The one-time setup code lives only in the API's environment (OWNER_SETUP_TOKEN).
 * Unset or shorter than 32 characters: setup is switched off.
 */
function assertSetupToken(provided: string | null): void {
  const expected = process.env.OWNER_SETUP_TOKEN ?? "";
  if (expected.length < 32) {
    throw new ForbiddenError("Owner setup is not enabled on this server");
  }
  const digest = (v: string) => createHash("sha256").update(v).digest();
  if (!provided || !timingSafeEqual(digest(provided), digest(expected))) {
    throw new UnauthorizedError("Invalid setup code");
  }
}

async function countUsers(
  column: "role" | "username" | "email",
  value: string,
): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("users")
    .select("user_id", { count: "exact", head: true })
    .eq(column, value);
  if (error) throw new AppError(error.message, 500, "DATABASE_ERROR");
  return count ?? 0;
}

const setupComplete = () => {
  // Setup stays closed regardless; this reminds the operator to delete the leftover secret.
  logger.warn("setup.token_still_configured", {
    action: "Remove OWNER_SETUP_TOKEN from the API environment",
  });
  return new AppError(
    "The Owner account is already set up",
    409,
    "SETUP_COMPLETE",
  );
};

/**
 * One-time Owner/Admin registration (no session exists yet, so the setup code authorizes it).
 * The role is fixed here; the request has no role field.
 * provision_initial_owner holds an advisory lock, so concurrent requests cannot create two owners.
 */
export async function provisionInitialOwner(
  setupToken: string | null,
  data: OwnerSetupRequest,
): Promise<OwnerSetupResponse> {
  assertSetupToken(setupToken);

  if (data.email.endsWith(`@${STAFF_EMAIL_DOMAIN}`)) {
    throw new AppError("Use your real email address", 400, "VALIDATION_ERROR");
  }
  if ((await countUsers("role", "owner_admin")) > 0) throw setupComplete();
  if ((await countUsers("username", data.username)) > 0) {
    throw new ConflictError(`Username '${data.username}' is already taken`);
  }
  if ((await countUsers("email", data.email)) > 0) {
    throw new ConflictError("Email address is already registered");
  }

  // Confirmed at creation: setup needs the setup code, and every sign-in proves the inbox again
  // with an emailed code.
  const { data: created, error: authError } =
    await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      app_metadata: { role: "owner_admin" },
      user_metadata: { full_name: data.fullName, username: data.username },
    });
  if (authError || !created.user) {
    if (authError?.code === "email_exists") {
      throw new ConflictError("Email address is already registered");
    }
    throw new AppError(
      authError?.message ?? "Could not create the sign-in account",
      400,
      "AUTH_ERROR",
    );
  }

  const { data: profile, error: profileError } = await supabaseAdmin.rpc(
    "provision_initial_owner",
    {
      p_auth_user_id: created.user.id,
      p_username: data.username,
      p_full_name: data.fullName,
      p_email: data.email,
    },
  );
  if (profileError || !profile) {
    // Roll back so no sign-in exists without a profile.
    await supabaseAdmin.auth.admin.deleteUser(created.user.id);
    const msg = profileError?.message ?? "";
    if (msg.includes("OWNER_EXISTS")) throw setupComplete();
    if (profileError?.code === "23505") {
      throw new ConflictError(
        msg.includes("email")
          ? "Email address is already registered"
          : `Username '${data.username}' is already taken`,
      );
    }
    throw new AppError(
      msg || "Could not create the Owner profile",
      500,
      "DATABASE_ERROR",
    );
  }

  await logAuditEvent({
    action: "owner.setup",
    userId: created.user.id,
    userRole: "owner_admin",
    resource: "users",
    resourceId: String(profile.user_id),
    details: { username: profile.username },
  });

  return {
    id: String(profile.user_id),
    authUserId: profile.auth_user_id,
    username: profile.username,
    fullName: profile.full_name,
    role: "owner_admin",
    email: data.email,
    isActive: profile.status === "active",
    createdAt: profile.date_created,
  };
}
