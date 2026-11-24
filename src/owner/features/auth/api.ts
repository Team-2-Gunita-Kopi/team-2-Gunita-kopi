import type { MockSession } from "@/auth";
import { apiClient } from "@/owner/lib/api-client";

/** otpRequired: no session yet; the Owner enters the emailed code next (verifySignInCode). */
type SessionUser = MockSession & { otpRequired?: boolean };
// Display name for the header only (not authoritative); authorization stays server-side.
const OWNER_NAME_KEY = "gk-admin-owner-name";

/**
 * Real sign-in: this site's server (/auth/login) signs in through apps/api and keeps the session
 * in an HttpOnly cookie. The browser receives display details only, never tokens.
 */
export async function signIn(identifier: string, password: string): Promise<SessionUser> {
  const res = await apiClient<SessionUser>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username: identifier, password }),
  });
  if (!res.success || !res.data) {
    throw new Error(res.error?.message ?? "Incorrect username or password.");
  }
  const session = {
    ...res.data,
    fullName: res.data.fullName || identifier,
    username: res.data.username || identifier,
  };
  window.sessionStorage.setItem(OWNER_NAME_KEY, session.fullName);
  return session;
}

/** Revokes the session and clears the HttpOnly cookie on the server. */
export async function signOut(): Promise<void> {
  try {
    await apiClient<null>("/auth/logout", { method: "POST" });
  } finally {
    window.sessionStorage.removeItem(OWNER_NAME_KEY);
  }
}

/** Only the cached display name; the session cookie is HttpOnly and pages rely on the middleware guard. */
export function getSession(): Pick<MockSession, "fullName"> | null {
  const fullName = window.sessionStorage.getItem(OWNER_NAME_KEY);
  return fullName ? { fullName } : null;
}

// Password recovery runs on this site's server (/auth/recovery): the recovery session stays in an
// HttpOnly cookie. Supabase emails a 6-digit code (the "Reset password" template needs {{ .Token }}).
const recovery = async (body: Record<string, string>) => {
  const res = await apiClient<null>("/auth/recovery", { method: "POST", body: JSON.stringify(body) });
  if (!res.success) throw new Error(res.error?.message ?? "Password recovery failed.");
};

export const requestPasswordRecovery = (email: string) => recovery({ step: "request", email });

export const verifyRecoveryCode = (email: string, code: string) =>
  recovery({ step: "verify", email, code });

/** Runs after verifyRecoveryCode. Signs out every session of the account; sign in again after. */
export const resetPassword = (_email: string, _code: string, password: string) =>
  recovery({ step: "reset", password });

/** Second Owner sign-in step: the 6-digit code emailed after the password (this site's /auth/otp). */
export async function verifySignInCode(code: string): Promise<void> {
  const res = await apiClient<null>("/auth/otp", {
    method: "POST",
    body: JSON.stringify({ action: "verify", code }),
  });
  if (!res.success) throw new Error(res.error?.message ?? "That code is not valid.");
}

export async function resendSignInCode(): Promise<void> {
  const res = await apiClient<null>("/auth/otp", {
    method: "POST",
    body: JSON.stringify({ action: "resend" }),
  });
  if (!res.success) throw new Error(res.error?.message ?? "Could not send a new code.");
}
