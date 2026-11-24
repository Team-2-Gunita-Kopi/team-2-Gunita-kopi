import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Records when each Supabase call starts, and holds getUser() open until the test releases it.
const events: string[] = [];
let releaseGetUser: () => void = () => {};
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const OWNER = `${b64({ alg: "HS256" })}.${b64({ sub: "auth-owner", app_metadata: { role: "owner_admin" } })}.sig`;
const OTHER_SUB = `${b64({ alg: "HS256" })}.${b64({ sub: "someone-else", app_metadata: { role: "owner_admin" } })}.sig`;

vi.mock("../src/lib/supabase-user", () => ({
  createScopedUserClient: () => ({
    rpc: async () => {
      events.push("app_role");
      return { data: "owner_admin", error: null };
    },
    auth: {
      getUser: async () => {
        events.push("getUser:start");
        await new Promise<void>((r) => (releaseGetUser = r));
        events.push("getUser:end");
        return { data: { user: { id: "auth-owner", email: "o@x" } }, error: null };
      },
    },
    from: () => ({
      select: () => ({
        eq: (_c: string, id: string) => ({
          maybeSingle: async () => {
            events.push(`profile:${id}`);
            return { data: { user_id: 1, role: "owner_admin", status: "active" }, error: null };
          },
        }),
      }),
    }),
  }),
}));

const { requireUser } = await import("../src/lib/auth");
const req = (t: string) => new NextRequest("http://api.local/api/x", { headers: { authorization: `Bearer ${t}` } });

describe("requireUser speed", () => {
  // Why: every API call checks identity first. Three Supabase round trips one after another cost
  // about 300 ms from the Philippines; run together they cost one.
  it("starts the profile and approval lookups before the token check finishes", async () => {
    events.length = 0;
    const pending = requireUser(req(OWNER));
    await vi.waitFor(() => expect(events).toContain("getUser:start"));
    expect(events).toEqual(expect.arrayContaining(["profile:auth-owner", "app_role"]));
    expect(events).not.toContain("getUser:end");
    releaseGetUser();
    await expect(pending).resolves.toMatchObject({ userId: 1, role: "owner_admin" });
  });

  // Why: the early lookups use an unverified claim; only the verified user id may be used.
  it("ignores early results when the verified user id differs", async () => {
    events.length = 0;
    const pending = requireUser(req(OTHER_SUB));
    await vi.waitFor(() => expect(events).toContain("getUser:start"));
    releaseGetUser();
    await pending;
    expect(events).toContain("profile:auth-owner");
  });
});
