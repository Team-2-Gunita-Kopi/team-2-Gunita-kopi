import type { NextRequest } from "next/server";
import { MOCK_SESSION_COOKIE, decodeMockSession, type Role } from "@/auth";

/**
 * Demo mode only: resolves the role from the unsigned mock cookie. Real sessions are verified by
 * createAuthMiddleware (HttpOnly Supabase cookie), never decoded here.
 */
export function resolveRole(request: NextRequest, useMocks: boolean): Role | null {
  if (!useMocks) return null;
  return decodeMockSession(request.cookies.get(MOCK_SESSION_COOKIE)?.value)?.role ?? null;
}
