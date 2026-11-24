import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSession, signIn, signOut } from "@/features/auth/api";

const cashier = {
  userId: "barista-1",
  role: "barista" as const,
  fullName: "Test Barista",
  username: "testbarista",
};

function mockResponse(data: unknown) {
  return {
    json: async () => ({ success: true, data }),
  } as Response;
}

describe("real POS cashier session metadata", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps safe cashier details available to checkout without storing tokens", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(cashier)));

    await signIn("testbarista", "password");

    expect(getSession()).toEqual(cashier);
    expect(window.sessionStorage.length).toBe(1);
    expect(window.sessionStorage.getItem("gk-pos-cashier")).not.toContain(
      "token",
    );
  });

  it("clears cashier details when signing out", async () => {
    window.sessionStorage.setItem("gk-pos-cashier", JSON.stringify(cashier));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(null)));

    await signOut();

    expect(getSession()).toBeNull();
  });

  it("discards malformed or non-Barista cached details", () => {
    window.sessionStorage.setItem("gk-pos-cashier", "{");
    expect(getSession()).toBeNull();

    window.sessionStorage.setItem(
      "gk-pos-cashier",
      JSON.stringify({ ...cashier, role: "owner_admin" }),
    );
    expect(getSession()).toBeNull();
    expect(window.sessionStorage.length).toBe(0);
  });
});
