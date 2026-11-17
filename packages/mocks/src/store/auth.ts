import type { UserProfile } from "@gunita/contracts";
import { MockError, ownerData, type MockState } from "./state";

/** Login: matches username or email (case-insensitive), active users only. Never returns the password. */
export function authenticate(state: MockState, identifier: string, password: string): UserProfile | null {
  const id = identifier.trim().toLowerCase();
  if (!id) return null;
  const u = (state.users ?? []).find(
    (x) => x.isActive && x.password === password && (x.username?.toLowerCase() === id || x.email.toLowerCase() === id),
  );
  if (!u) return null;
  const { password: _password, ...profile } = u;
  return profile;
}

const RECOVERY_TTL_MS = 15 * 60 * 1000;
const MIN_PASSWORD = 8;
const BAD_CODE = "That recovery code is invalid or has expired.";

function findOwnerByEmail(state: MockState, email: string) {
  const e = email.trim().toLowerCase();
  return ownerData(state).users.find((u) => u.isActive && u.role === "owner_admin" && u.email.toLowerCase() === e);
}

/**
 * Issues a 6-digit recovery code when the email belongs to an active Owner. Always returns null so the
 * caller cannot tell whether the account exists. The demo has no mail server, so the code is logged.
 */
export function requestPasswordRecovery(state: MockState, email: string, now: Date, rand: () => number = Math.random): null {
  const owner = findOwnerByEmail(state, email);
  if (!owner) return null;
  const code = String(Math.floor(rand() * 1_000_000)).padStart(6, "0");
  state.recoveryCodes = {
    ...state.recoveryCodes,
    [owner.email.toLowerCase()]: { code, expiresAt: new Date(now.getTime() + RECOVERY_TTL_MS).toISOString() },
  };
  console.info(`[mock] Owner recovery code for ${owner.email}: ${code}`);
  return null;
}

function checkCode(state: MockState, email: string, code: string, now: Date): string {
  const key = email.trim().toLowerCase();
  const entry = state.recoveryCodes?.[key];
  if (!entry || entry.code !== code.trim() || Date.parse(entry.expiresAt) <= now.getTime()) {
    throw new MockError("VALIDATION", BAD_CODE);
  }
  return key;
}

export function verifyRecoveryCode(state: MockState, email: string, code: string, now: Date): true {
  checkCode(state, email, code, now);
  return true;
}

export function resetPasswordWithCode(state: MockState, email: string, code: string, password: string, now: Date): true {
  const key = checkCode(state, email, code, now);
  if (password.length < MIN_PASSWORD) throw new MockError("VALIDATION", `Password must be at least ${MIN_PASSWORD} characters`);
  const owner = findOwnerByEmail(state, email);
  if (!owner) throw new MockError("VALIDATION", BAD_CODE);
  owner.password = password;
  const { [key]: _used, ...rest } = state.recoveryCodes ?? {};
  state.recoveryCodes = rest;
  return true;
}

/** Initial Owner registration: allowed only while no Owner account exists. */
export function registrationOpen(state: MockState): boolean {
  return !ownerData(state).users.some((u) => u.role === "owner_admin");
}
