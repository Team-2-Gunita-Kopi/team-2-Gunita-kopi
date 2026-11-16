import { describe, it, expect } from "vitest";
import { requireUser, requireRole } from "../src/lib/auth";
import { UnauthorizedError, ForbiddenError } from "../src/lib/errors";
import { NextRequest } from "next/server";

function createMockJwt(claims: Record<string, unknown>): string {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64");
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64");
  return `${header}.${payload}.mockSignature`;
}

describe("API Server Authorization Guard", () => {
  it("throws UnauthorizedError when Authorization header is missing", async () => {
    const req = new NextRequest("http://localhost:3002/api/products");
    await expect(requireUser(req)).rejects.toThrow(UnauthorizedError);
  });

  it("throws UnauthorizedError when Bearer token has invalid claims", async () => {
    const invalidToken = createMockJwt({ sub: "user_123" }); // missing role in app_metadata
    const req = new NextRequest("http://localhost:3002/api/products", {
      headers: {
        authorization: `Bearer ${invalidToken}`,
      },
    });

    await expect(requireUser(req)).rejects.toThrow(UnauthorizedError);
  });

  it("rejects barista trying to access owner_admin protected route with 403 Forbidden", async () => {
    const baristaToken = createMockJwt({
      sub: "barista_usr_01",
      email: "barista@gunitakopi.com",
      app_metadata: { role: "barista" },
    });

    const req = new NextRequest("http://localhost:3002/api/products", {
      headers: {
        authorization: `Bearer ${baristaToken}`,
      },
    });

    await expect(requireRole(req, "owner_admin")).rejects.toThrow(
      ForbiddenError,
    );
  });

  it("allows owner_admin to access owner_admin protected route", async () => {
    const ownerToken = createMockJwt({
      sub: "owner_usr_01",
      email: "owner@gunitakopi.com",
      app_metadata: { role: "owner_admin" },
    });

    const req = new NextRequest("http://localhost:3002/api/products", {
      headers: {
        authorization: `Bearer ${ownerToken}`,
      },
    });

    const user = await requireRole(req, "owner_admin");
    expect(user.id).toBe("owner_usr_01");
    expect(user.role).toBe("owner_admin");
  });

  it("allows barista to access shared barista route", async () => {
    const baristaToken = createMockJwt({
      sub: "barista_usr_02",
      email: "barista@gunitakopi.com",
      app_metadata: { role: "barista" },
    });

    const req = new NextRequest("http://localhost:3002/api/orders", {
      headers: {
        authorization: `Bearer ${baristaToken}`,
      },
    });

    const user = await requireRole(req, ["barista", "owner_admin"]);
    expect(user.role).toBe("barista");
  });
});
