import type { MockSession } from "@gunita/auth";
import { apiClient } from "@/lib/api-client";
import { supabaseBrowser } from "@/lib/supabase-browser";

type SessionUser = MockSession;

/**
 * Real sign-in: this site's server (/auth/login) signs in through apps/api and keeps the session
 * in an HttpOnly cookie. The browser receives display details only, never tokens.
 */
export async function signIn(identifier: string, password: string): Promise<MockSession> {
  const res = await apiClient<SessionUser>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username: identifier, password }),
  });
  if (!res.success || !res.data) {
    throw new Error(res.error?.message ?? "Incorrect username or password.");
  }
  return {
    ...res.data,
    fullName: res.data.fullName || identifier,
    username: res.data.username || identifier,
  };
}

/** Revokes the session and clears the HttpOnly cookie on the server. */
export async function signOut(): Promise<void> {
  await apiClient<null>("/auth/logout", { method: "POST" });
}

export function getSession(): MockSession | null {
  return null; // The session cookie is HttpOnly; pages rely on the middleware guard.
}

export interface RegisterOwnerRequest {
  fullName: string;
  email: string;
  username: string;
  password: string;
}

/** Supabase emails a recovery OTP (the "Reset password" template must include {{ .Token }}). */
export async function requestPasswordRecovery(email: string): Promise<void> {
  const { error } = await supabaseBrowser.auth.resetPasswordForEmail(email);
  if (error) throw new Error(error.message);
}

export async function verifyRecoveryCode(email: string, code: string): Promise<void> {
  const { error } = await supabaseBrowser.auth.verifyOtp({ email, token: code, type: "recovery" });
  if (error) throw new Error("That recovery code is invalid or has expired.");
}

/** Runs after verifyRecoveryCode, which signed the user in with a recovery session. */
export async function resetPassword(_email: string, _code: string, password: string): Promise<void> {
  const { error } = await supabaseBrowser.auth.updateUser({ password });
  if (error) throw new Error(error.message);
  await supabaseBrowser.auth.signOut();
}

/**
 * The Owner account is created once, through POST /api/setup/owner, which needs the server's
 * one-time setup code. Public sign-up is disabled, so this opens the /setup page instead.
 */
export async function registerOwner(_req: RegisterOwnerRequest): Promise<void> {
  window.location.assign("/setup");
  return new Promise(() => {}); // navigating away
}
