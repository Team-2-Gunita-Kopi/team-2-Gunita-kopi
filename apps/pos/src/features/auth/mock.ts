import {
  MOCK_SESSION_COOKIE,
  decodeMockSession,
  encodeMockSession,
  type MockSession,
} from "@gunita/auth";
import type { UserProfile } from "@gunita/contracts";
import { mockRpc } from "@/lib/mock-db";

const REQUIRED_ROLE = "barista";
export const WRONG_ROLE_MESSAGE = "This is the Barista page. Please use the Owner portal for this account.";
// `authenticate` only returns active users, so the demo service cannot tell an
// inactive account from bad credentials; the constant is kept for the real API.
export const INACTIVE_MESSAGE = "This account is inactive. Contact the administrator.";
export const BAD_CREDENTIALS_MESSAGE = "Incorrect username or password.";

export async function signIn(identifier: string, password: string): Promise<MockSession> {
  const user = await mockRpc<UserProfile | null>("authenticate", identifier, password);
  if (!user) throw new Error(BAD_CREDENTIALS_MESSAGE);
  if (!user.isActive) throw new Error(INACTIVE_MESSAGE);
  if (user.role !== REQUIRED_ROLE) throw new Error(WRONG_ROLE_MESSAGE);
  const session: MockSession = {
    userId: user.id,
    role: user.role,
    fullName: user.fullName,
    username: user.username ?? identifier,
  };
  document.cookie = `${MOCK_SESSION_COOKIE}=${encodeMockSession(session)}; path=/; SameSite=Lax`;
  return session;
}

export async function signOut(): Promise<void> {
  document.cookie = `${MOCK_SESSION_COOKIE}=; path=/; SameSite=Lax; Max-Age=0`;
}

export function getSession(): MockSession | null {
  const match = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${MOCK_SESSION_COOKIE}=`));
  return decodeMockSession(match?.slice(MOCK_SESSION_COOKIE.length + 1));
}
