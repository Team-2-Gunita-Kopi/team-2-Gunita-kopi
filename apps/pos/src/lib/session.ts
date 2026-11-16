import type { NextRequest } from "next/server";
import {
  MOCK_SESSION_COOKIE,
  decodeMockSession,
  extractRoleFromToken,
  type Role,
} from "@gunita/auth";

/** Edge-safe: resolves the role from the mock cookie (mocks only) or the Supabase token. */
export function resolveRole(request: NextRequest, useMocks: boolean): Role | null {
  if (useMocks) {
    return decodeMockSession(request.cookies.get(MOCK_SESSION_COOKIE)?.value)?.role ?? null;
  }

  let accessToken: string | null = null;
  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.includes("-auth-token")) {
      try {
        const parsed = JSON.parse(cookie.value);
        if (Array.isArray(parsed) && parsed[0]) {
          accessToken = parsed[0];
        } else if (parsed?.access_token) {
          accessToken = parsed.access_token;
        }
      } catch {
        accessToken = cookie.value;
      }
      break;
    }
  }

  if (!accessToken) {
    const authHeader = request.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      accessToken = authHeader.substring(7);
    }
  }

  return accessToken ? extractRoleFromToken(accessToken) : null;
}
