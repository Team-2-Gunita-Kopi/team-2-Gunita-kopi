import { createHash, randomBytes } from "node:crypto";
import { decodeJwtPayload } from "@gunita/auth";
import {
  LoginRequest,
  LoginResponse,
  LoginSession,
  OwnerOtpRequest,
} from "./schema";
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
 * Username sign-in for every role (the Owner may also give their email). The browser never learns
 * the Auth email: the Owner's real address comes from users.email (kept equal to auth.users.email by
 * a trigger), baristas use the internal mapping.
 * Supabase Auth checks the password; requireUser checks role and status on every API call.
 * Owner: the password session is revoked and only an emailed-code challenge is returned (ownerOtp).
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
    .select("auth_user_id, username, email, role, status")
    .eq(data.username.includes("@") ? "email" : "username", data.username)
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

  // Baristas: the Auth email of the linked account, not one rebuilt from today's username, so a
  // username edited after creation still signs in to the same Auth user (same password).
  let email = profile.email;
  if (!email) {
    const { data: linked, error: linkError } =
      await supabaseAdmin.auth.admin.getUserById(profile.auth_user_id);
    if (linkError && (linkError.status ?? 500) >= 500) {
      logger.error("auth.linked_user_lookup_failed", { status: linkError.status });
      throw signInUnavailable();
    }
    email = linked?.user?.email ?? null;
    if (!email) throw await fail("unlinked_account");
  }
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
  if (profile.role === "owner_admin")
    return startOwnerChallenge(profile.auth_user_id, auth.session.access_token);
  return {
    accessToken: auth.session.access_token,
    refreshToken: auth.session.refresh_token,
    expiresAt: auth.session.expires_at,
  };
}

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
const otpExpired = () =>
  new AppError("The code has expired. Sign in again.", 401, "OTP_EXPIRED");

/**
 * Owner, after the password matched: the password session never grants access. It is revoked here
 * (and app_role() would refuse it anyway), and a random challenge is returned instead. Only its hash
 * is stored; the Admin server keeps the challenge in an HttpOnly cookie.
 */
async function startOwnerChallenge(
  authUserId: string,
  passwordAccessToken: string,
): Promise<LoginResponse> {
  const { error: outError } = await supabaseAdmin.auth.admin.signOut(
    passwordAccessToken,
    "local",
  );
  if (outError)
    logger.error("auth.password_session_revoke_failed", {
      status: outError.status,
    });

  const challenge = randomBytes(32).toString("base64url");
  // Older unfinished challenges of this Owner stop working.
  await supabaseAdmin
    .from("owner_login_challenges")
    .delete()
    .eq("auth_user_id", authUserId)
    .is("session_id", null);
  const { error } = await supabaseAdmin
    .from("owner_login_challenges")
    .insert({ token_hash: sha256(challenge), auth_user_id: authUserId });
  if (error) {
    logger.error("auth.otp_challenge_failed", { error: error.message });
    throw signInUnavailable();
  }
  return { otpRequired: true, challenge };
}

const OTP_ERRORS: Record<string, () => AppError> = {
  OTP_EXPIRED: otpExpired,
  OTP_LIMIT: () =>
    new AppError(
      "Too many codes or attempts. Sign in again.",
      429,
      "OTP_LIMIT",
    ),
  OTP_RESEND_WAIT: () =>
    new AppError(
      "Wait a minute before asking for a new code.",
      429,
      "OTP_RESEND_WAIT",
    ),
};

/**
 * Second Owner sign-in step: Supabase Auth emails a 6-digit code (5-minute expiry, single use;
 * the "Magic Link" template must show {{ .Token }}). "send" mails a code; "verify" checks it and,
 * on success, approves the new session (owner_login_challenges.session_id) and returns it.
 * Limits per challenge (owner_otp_use): 3 sends, 60 s apart, 5 code attempts, 10 minutes.
 */
export async function ownerOtp(
  req: OwnerOtpRequest,
): Promise<{ sent: true } | LoginSession> {
  const hash = sha256(req.challenge);
  const { data, error } = await supabaseAdmin.rpc("owner_otp_use", {
    p_token_hash: hash,
    p_kind: req.action,
  });
  if (error) {
    const known = OTP_ERRORS[error.message.split(":")[0] ?? ""];
    if (known) throw known();
    logger.error("auth.otp_challenge_failed", { error: error.message });
    throw signInUnavailable();
  }
  const owner = data?.[0];
  if (!owner) throw otpExpired(); // deactivated since the password step

  const auth = createAuthClient().auth;
  const outage = (status?: number) => {
    // Supabase's own per-address email limit, or an Auth outage.
    if (status === 429) return OTP_ERRORS.OTP_RESEND_WAIT!();
    logger.error("auth.supabase_otp_error", { status });
    return signInUnavailable();
  };

  if (req.action === "send") {
    const { error: sendError } = await auth.signInWithOtp({
      email: owner.email,
      options: { shouldCreateUser: false },
    });
    if (sendError) throw outage(sendError.status);
    return { sent: true };
  }

  const { data: verified, error: verifyError } = await auth.verifyOtp({
    email: owner.email,
    token: req.code,
    type: "email",
  });
  if (verifyError || !verified.session) {
    const status = verifyError?.status ?? 0;
    if (status === 429 || status >= 500) throw outage(status);
    throw new AppError(
      "That code is not valid or has expired.",
      400,
      "INVALID_CODE",
    );
  }

  const session = verified.session;
  const sessionId = decodeJwtPayload(session.access_token)?.session_id;
  const { data: approved, error: approveError } = sessionId
    ? await supabaseAdmin
        .from("owner_login_challenges")
        .update({ session_id: sessionId, verified_at: new Date().toISOString() })
        .eq("token_hash", hash)
        .eq("auth_user_id", session.user.id)
        .is("session_id", null)
        .select("challenge_id")
    : { data: null, error: null };
  if (approveError || !approved?.length) {
    // Wrong account, a race on the same challenge, or no session id: never hand this session out.
    await supabaseAdmin.auth.admin.signOut(session.access_token, "local");
    if (approveError)
      logger.error("auth.otp_approve_failed", { error: approveError.message });
    throw otpExpired();
  }
  logger.info("auth.owner_otp_verified", {});
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at,
  };
}
