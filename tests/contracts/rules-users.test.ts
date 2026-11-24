import { describe, expect, it } from "vitest";
import { checkUserChange } from "@/contracts/ui";

const users = [
  { id: "o1", role: "owner_admin" as const, isActive: true },
  { id: "o2", role: "owner_admin" as const, isActive: true },
  { id: "b1", role: "barista" as const, isActive: false },
];
const solo = [users[0]!, users[2]!];

describe("checkUserChange", () => {
  it("blocks self-deactivation", () => {
    expect(
      checkUserChange(users, "o1", { role: "owner_admin", isActive: false }, "o1"),
    ).toEqual({ ok: false, message: "You can't deactivate your own account." });
  });
  it("blocks demoting the only active owner", () => {
    expect(
      checkUserChange(solo, "o1", { role: "barista", isActive: true }, "b1"),
    ).toEqual({ ok: false, message: "At least one active Owner must remain." });
  });
  it("allows demoting one of two owners", () => {
    expect(
      checkUserChange(users, "o2", { role: "barista", isActive: true }, "o1"),
    ).toEqual({ ok: true });
  });
  it("allows deactivating an already inactive barista", () => {
    expect(
      checkUserChange(users, "b1", { role: "barista", isActive: false }, "o1"),
    ).toEqual({ ok: true });
  });
});
