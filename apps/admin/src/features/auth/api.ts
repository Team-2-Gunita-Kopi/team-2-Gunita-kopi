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
  setupCode?: string;
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

export type MfaStart =
  | { step: "verify" }
  | { step: "enroll"; factorId: string; qrCode: string; secret: string };

/** Second sign-in step (SDS 2.4): enroll a TOTP app the first time, otherwise ask for a code. */
export async function startMfa(): Promise<MfaStart> {
  const res = await apiClient<MfaStart>("/auth/mfa", { method: "POST", body: JSON.stringify({ action: "start" }) });
  if (!res.success || !res.data) throw new Error(res.error?.message ?? "Could not start the second step.");
  return res.data;
}

/** factorId: during setup, the authenticator whose QR code was shown. */
export async function verifyMfa(code: string, factorId?: string): Promise<void> {
  const res = await apiClient<null>("/auth/mfa", {
    method: "POST",
    body: JSON.stringify({ action: "verify", code, factorId }),
  });
  if (!res.success) throw new Error(res.error?.message ?? "That code is not valid.");
}

/**
 * Creates the one-time Owner account through this site's server (/auth/setup), which also signs the
 * new Owner in (first step only) so the authenticator is set up at /mfa next. Local setup
 * authorization is added by the server.
 */
export async function registerOwner(req: RegisterOwnerRequest): Promise<void> {
  const setupCode = req.setupCode?.trim();

  const res = await apiClient<SessionUser>("/auth/setup", {
    method: "POST",
    headers: setupCode ? { "X-Setup-Token": setupCode } : undefined,
    body: JSON.stringify({
      email: req.email,
      fullName: req.fullName,
      username: req.username,
      password: req.password,
      confirmPassword: req.password,
    }),
  });
  if (!res.success) {
    throw new Error(res.error?.message ?? "Owner account setup failed.");
  }
}
