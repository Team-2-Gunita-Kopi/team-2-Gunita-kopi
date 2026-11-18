import type { MockSession } from "@gunita/auth";
import { apiClient } from "@/lib/api-client";

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
