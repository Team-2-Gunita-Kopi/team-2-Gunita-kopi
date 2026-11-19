import type { MockSession } from "@gunita/auth";
import { apiClient } from "@/lib/api-client";

/** mfaRequired: the Owner still has to complete the second sign-in step at /mfa. */
type SessionUser = MockSession & { mfaRequired?: boolean };

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

export type MfaStart = { step: "verify" } | { step: "enroll"; qrCode: string; secret: string };

/** Second sign-in step (SDS 2.4): enroll a TOTP app the first time, otherwise ask for a code. */
export async function startMfa(): Promise<MfaStart> {
  const res = await apiClient<MfaStart>("/auth/mfa", { method: "POST", body: JSON.stringify({ action: "start" }) });
  if (!res.success || !res.data) throw new Error(res.error?.message ?? "Could not start the second step.");
  return res.data;
}

export async function verifyMfa(code: string): Promise<void> {
  const res = await apiClient<null>("/auth/mfa", { method: "POST", body: JSON.stringify({ action: "verify", code }) });
  if (!res.success) throw new Error(res.error?.message ?? "That code is not valid.");
}

/**
 * The Owner account is created once, through POST /api/setup/owner, which needs the server's
 * one-time setup code. Public sign-up is disabled, so this opens the /setup page instead.
 */
export async function registerOwner(_req: RegisterOwnerRequest): Promise<void> {
  window.location.assign("/setup");
  return new Promise(() => {}); // navigating away
}
