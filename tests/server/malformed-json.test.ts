import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

// These routes must answer malformed JSON with 400 INVALID_JSON before touching any service.
vi.mock("@/server/lib/supabase-admin", () => ({ supabaseAdmin: {} }));
vi.mock("@/server/lib/supabase-user", () => ({
  createScopedUserClient: () => ({}),
  createAuthClient: () => ({}),
}));
vi.mock("@/server/lib/auth", () => ({
  requireRole: async () => ({
    id: "auth-owner",
    userId: 1,
    role: "owner_admin",
  }),
}));

const login = await import("@/server/routes/auth/login/route");
const setup = await import("@/server/routes/setup/owner/route");
const employees = await import("@/server/routes/admin/employees/route");

const bad = (path: string) =>
  new NextRequest(`http://localhost:3002${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{not json",
  });

describe("malformed JSON bodies", () => {
  it.each([
    ["/api/auth/login", login.POST],
    ["/api/setup/owner", setup.POST],
    ["/api/admin/employees", employees.POST],
  ] as const)("%s answers 400 INVALID_JSON", async (path, handler) => {
    const res = await handler(bad(path));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_JSON");
  });
});
