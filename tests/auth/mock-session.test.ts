import { describe, expect, it } from "vitest";
import {
  MOCK_SESSION_COOKIE,
  decodeMockSession,
  encodeMockSession,
  type MockSession,
} from "@/auth/mock-session";

const session: MockSession = {
  userId: "u-1",
  role: "owner_admin",
  fullName: "María Dela Cruz ☕",
  username: "owner",
};

describe("mock session", () => {
  it("uses the agreed cookie name", () => {
    expect(MOCK_SESSION_COOKIE).toBe("gk-mock-session");
  });

  it("round-trips encode/decode including non-ASCII", () => {
    const encoded = encodeMockSession(session);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeMockSession(encoded)).toEqual(session);
  });

  it("returns null for garbage, empty and undefined", () => {
    expect(decodeMockSession("garbage")).toBeNull();
    expect(decodeMockSession("")).toBeNull();
    expect(decodeMockSession(undefined)).toBeNull();
  });

  it("returns null for an unknown role", () => {
    const bad = encodeMockSession({ ...session, role: "admin" as never });
    expect(decodeMockSession(bad)).toBeNull();
  });
});
