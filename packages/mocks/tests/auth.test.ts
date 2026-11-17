import { describe, expect, it, vi } from "vitest";
import { MockError, createState } from "../src/store/state";
import {
  authenticate,
  registrationOpen,
  requestPasswordRecovery,
  resetPasswordWithCode,
  verifyRecoveryCode,
} from "../src/store/auth";
import { NOW } from "./helpers";

const fresh = () => createState("owner", NOW);
const later = (ms: number) => new Date(NOW.getTime() + ms);
const fixed = () => 0.123456; // -> "123456"

describe("authenticate", () => {
  const s = createState("owner", NOW);
  it("matches username or email", () => {
    expect(authenticate(s, "owner", "owner123")?.id).toBe("u-owner");
    expect(authenticate(s, "owner@gunita.local", "owner123")?.id).toBe("u-owner");
  });
  it("never returns the password", () => {
    expect(authenticate(s, "owner", "owner123")).not.toHaveProperty("password");
  });
  it("rejects a wrong password or unknown user", () => {
    expect(authenticate(s, "owner", "nope")).toBeNull();
    expect(authenticate(s, "ghost", "owner123")).toBeNull();
  });
  it("rejects inactive users", () => {
    const t = createState("owner", NOW);
    t.users!.find((u) => u.id === "u-juan")!.isActive = false;
    expect(authenticate(t, "barista", "barista123")).toBeNull();
  });
  it("works on a state without owner data", () => {
    expect(authenticate(createState("pos", NOW), "owner", "owner123")).toBeNull();
  });
});

describe("owner password recovery", () => {
  it("issues a code for an Owner email and resets the password with it", () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const s = fresh();
    expect(requestPasswordRecovery(s, "OWNER@gunita.local", NOW, fixed)).toBeNull();
    expect(verifyRecoveryCode(s, "owner@gunita.local", "123456", NOW)).toBe(true);
    resetPasswordWithCode(s, "owner@gunita.local", "123456", "newpass123", NOW);
    expect(authenticate(s, "owner", "newpass123")?.id).toBe("u-owner");
    expect(authenticate(s, "owner", "owner123")).toBeNull();
    // code is single-use
    expect(() => verifyRecoveryCode(s, "owner@gunita.local", "123456", NOW)).toThrow(MockError);
  });

  it("does not issue codes for unknown or non-Owner emails", () => {
    const s = fresh();
    expect(requestPasswordRecovery(s, "barista@gunita.local", NOW, fixed)).toBeNull();
    expect(requestPasswordRecovery(s, "nobody@x.y", NOW, fixed)).toBeNull();
    expect(s.recoveryCodes ?? {}).toEqual({});
  });

  it("rejects wrong and expired codes, and short passwords", () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const s = fresh();
    requestPasswordRecovery(s, "owner@gunita.local", NOW, fixed);
    expect(() => verifyRecoveryCode(s, "owner@gunita.local", "000000", NOW)).toThrow("invalid or has expired");
    expect(() => verifyRecoveryCode(s, "owner@gunita.local", "123456", later(15 * 60 * 1000))).toThrow(MockError);
    expect(() => resetPasswordWithCode(s, "owner@gunita.local", "123456", "short", NOW)).toThrow("at least 8");
  });
});

describe("owner registration", () => {
  it("is closed once an Owner exists", () => {
    const s = fresh();
    expect(registrationOpen(s)).toBe(false);
    s.users = s.users!.filter((u) => u.role !== "owner_admin");
    expect(registrationOpen(s)).toBe(true);
  });
});
