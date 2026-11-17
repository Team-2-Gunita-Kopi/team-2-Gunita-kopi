import { LoginRequest, LoginResponse, usernameToAuthEmail } from "./schema";
import { AppError, UnauthorizedError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createAuthClient } from "@/lib/supabase-user";
import {
  assertNotLocked,
  logKey,
  recordFailure,
  recordSuccess,
  signInUnavailable,
  throttleKeys,
} from "@/lib/login-throttle";

const invalidCredentials = () =>
  new UnauthorizedError("Invalid username or password");

/**
 * Username sign-in for every role. The browser never learns the Auth email:
 * the Owner's real address comes from users.email (kept equal to auth.users.email by a trigger),
 * baristas use the internal mapping.
 * Supabase Auth checks the password; requireUser checks role and status on every API call.
 * Every failure counts against the username+IP pair, the IP and the username, whether or not
 * the username exists. `data.username` is already normalized by LoginRequestSchema.
 */
export async function loginWithUsername(
  data: LoginRequest,
  ip: string,
): Promise<LoginResponse> {
  const keys = throttleKeys(data.username, ip);
  await assertNotLocked(keys);

  const { data: profile, error } = await supabaseAdmin
    .from("users")
    .select("username, email, status")
    .eq("username", data.username)
    .maybeSingle();
  if (error) {
    logger.error("auth.profile_lookup_failed", { error: error.message });
    throw signInUnavailable();
  }

  const fail = async (reason: string) => {
    logger.info("auth.login_failed", {
      reason,
      account: logKey(keys.account),
      ip: logKey(keys.ip),
    });
    await recordFailure(keys);
    return invalidCredentials();
  };

  if (!profile) throw await fail("unknown_user");
  if (profile.status !== "active") throw await fail("inactive");

  const email = profile.email ?? usernameToAuthEmail(profile.username);
  const { data: auth, error: signInError } =
    await createAuthClient().auth.signInWithPassword({
      email,
      password: data.password,
    });

  if (signInError || !auth.session) {
    // Supabase reports this only after the password matched.
    if (signInError?.code === "email_not_confirmed") {
      await recordSuccess(keys);
      throw new AppError(
        "Verify your email address first. Check your inbox for the confirmation link.",
        403,
        "EMAIL_NOT_CONFIRMED",
      );
    }
    const status = signInError?.status ?? 0;
    if (
      status === 429 ||
      status >= 500 ||
      signInError?.name === "AuthRetryableFetchError"
    ) {
      // Auth outage or rate limit, not a wrong password: do not count it against the user.
      logger.error("auth.supabase_signin_error", {
        code: signInError?.code,
        status,
      });
      throw signInUnavailable();
    }
    throw await fail("bad_password");
  }

  await recordSuccess(keys);
  logger.info("auth.login_succeeded", {
    account: logKey(keys.account),
    ip: logKey(keys.ip),
  });
  return {
    accessToken: auth.session.access_token,
    refreshToken: auth.session.refresh_token,
    expiresAt: auth.session.expires_at,
  };
}
