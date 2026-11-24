import type { MockSession } from "@/auth";
import { apiClient } from "@/staff/lib/api-client";

type SessionUser = MockSession;
const CASHIER_SESSION_KEY = "gk-pos-cashier";

function isCashierSession(value: unknown): value is MockSession {
  if (typeof value !== "object" || value === null) return false;
  const session = value as Partial<MockSession>;
  return (
    typeof session.userId === "string" &&
    session.role === "barista" &&
    typeof session.fullName === "string" &&
    typeof session.username === "string"
  );
}

/**
 * Real sign-in: this site's server (/auth/login) signs in through apps/api and keeps the session
 * in an HttpOnly cookie. Only non-authoritative cashier display details are cached in session
 * storage for local receipts; authorization remains server-side.
 */
export async function signIn(identifier: string, password: string): Promise<MockSession> {
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
  window.sessionStorage.setItem(CASHIER_SESSION_KEY, JSON.stringify(session));
  return session;
}

/** Revokes the session and clears the HttpOnly cookie on the server. */
export async function signOut(): Promise<void> {
  try {
    await apiClient<null>("/auth/logout", { method: "POST" });
  } finally {
    window.sessionStorage.removeItem(CASHIER_SESSION_KEY);
    // Shared tablet: drop cached API responses (orders, inventory) so the next barista starts
    // clean. Queued offline orders live in IndexedDB and are kept.
    if (typeof caches !== "undefined") await caches.delete("apis").catch(() => false);
  }
}

export function getSession(): MockSession | null {
  const cached = window.sessionStorage.getItem(CASHIER_SESSION_KEY);
  if (!cached) return null;

  try {
    const session: unknown = JSON.parse(cached);
    if (isCashierSession(session)) return session;
  } catch {
    window.sessionStorage.removeItem(CASHIER_SESSION_KEY);
    return null;
  }

  window.sessionStorage.removeItem(CASHIER_SESSION_KEY);
  return null;
}
