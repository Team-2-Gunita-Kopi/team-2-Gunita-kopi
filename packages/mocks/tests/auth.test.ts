import { describe, expect, it } from "vitest";
import { createState } from "../src/store/state";
import { authenticate } from "../src/store/auth";
import { NOW } from "./helpers";

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
