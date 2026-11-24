import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Fake Supabase: tokens map to auth users, auth users map to profile rows.
const jwt = (claims: Record<string, unknown>) =>
  `${Buffer.from("{}").toString("base64url")}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;
// OWNER: a session apps/api approved after the emailed code (app_role() returns the role).
// OWNER_UNAPPROVED: a password-only session, or an email-OTP session made outside apps/api.
const OWNER = jwt({ sub: "auth-owner", session_id: "approved" });
const OWNER_UNAPPROVED = jwt({ sub: "auth-owner", session_id: "other" });

const authUsers: Record<string, { id: string; email: string }> = {
  [OWNER]: { id: "auth-owner", email: "owner@gunitakopi.com" },
  [OWNER_UNAPPROVED]: { id: "auth-owner", email: "owner@gunitakopi.com" },
  "barista-token": { id: "auth-barista", email: "barista@gunitakopi.com" },
  "inactive-token": { id: "auth-inactive", email: "old@gunitakopi.com" },
  "no-profile-token": { id: "auth-orphan", email: "orphan@gunitakopi.com" },
};
const profiles: Record<
  string,
  { user_id: number; role: string; status: string }
> = {
  "auth-owner": { user_id: 1, role: "owner_admin", status: "active" },
  "auth-barista": { user_id: 2, role: "barista", status: "active" },
  "auth-inactive": { user_id: 3, role: "owner_admin", status: "inactive" },
};

vi.mock("../src/lib/supabase-user", () => ({
  createScopedUserClient: (token: string) => ({
    // Stands in for public.app_role(): the Owner role only for the approved session.
    rpc: async () => ({
      data: token === OWNER ? "owner_admin" : null,
      error: null,
    }),
    auth: {
      getUser: async (token: string) =>
        authUsers[token]
          ? { data: { user: authUsers[token] }, error: null }
          : { data: { user: null }, error: { message: "invalid JWT" } },
    },
    from: () => ({
      select: () => ({
        eq: (_col: string, authId: string) => ({
          maybeSingle: async () => ({
            data: profiles[authId] ?? null,
            error: null,
          }),
        }),
      }),
    }),
  }),
}));

const { requireUser, requireRole } = await import("../src/lib/auth");
const { UnauthorizedError, ForbiddenError } = await import("../src/lib/errors");

function req(token?: string) {
  return new NextRequest("http://localhost:3002/api/products", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

function forgedJwt(claims: Record<string, unknown>): string {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(claims)}.forged`;
}

describe("API Server Authorization Guard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws UnauthorizedError when Authorization header is missing", async () => {
    await expect(requireUser(req())).rejects.toThrow(UnauthorizedError);
  });

  it("rejects a forged token that claims owner_admin", async () => {
    const forged = forgedJwt({
      sub: "x",
      app_metadata: { role: "owner_admin" },
    });
    await expect(requireRole(req(forged), "owner_admin")).rejects.toThrow(
      UnauthorizedError,
    );
  });

  it("rejects an inactive account with 403", async () => {
    await expect(requireUser(req("inactive-token"))).rejects.toThrow(
      ForbiddenError,
    );
  });

  it("rejects a sign-in with no employee profile with 403", async () => {
    await expect(requireUser(req("no-profile-token"))).rejects.toThrow(
      ForbiddenError,
    );
  });

  it("rejects barista on an owner_admin route with 403", async () => {
    await expect(
      requireRole(req("barista-token"), "owner_admin"),
    ).rejects.toThrow(ForbiddenError);
  });

  // Why: a 403 must not tell a caller which roles exist or which one would work.
  it("does not name roles in a 403 message", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const err = await requireRole(req("barista-token"), "owner_admin").catch((e) => e);
    expect(err.statusCode).toBe(403);
    expect(err.message).not.toMatch(/owner_admin|barista/);
  });

  it("allows owner_admin and takes the role from the profile", async () => {
    const user = await requireRole(req(OWNER), "owner_admin");
    expect(user.id).toBe("auth-owner");
    expect(user.userId).toBe(1);
    expect(user.role).toBe("owner_admin");
  });

  it("rejects an Owner session that apps/api did not approve with MFA_REQUIRED", async () => {
    await expect(requireUser(req(OWNER_UNAPPROVED))).rejects.toMatchObject({
      statusCode: 403,
      code: "MFA_REQUIRED",
    });
  });

  it("does not require the emailed code for baristas", async () => {
    const user = await requireUser(req("barista-token"));
    expect(user.role).toBe("barista");
  });

  it("allows barista on a shared route", async () => {
    const user = await requireRole(req("barista-token"), [
      "barista",
      "owner_admin",
    ]);
    expect(user.role).toBe("barista");
    expect(user.userId).toBe(2);
  });
});
