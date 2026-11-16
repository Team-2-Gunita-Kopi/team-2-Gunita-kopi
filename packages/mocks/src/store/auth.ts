import type { UserProfile } from "@gunita/contracts";
import type { MockState } from "./state";

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
