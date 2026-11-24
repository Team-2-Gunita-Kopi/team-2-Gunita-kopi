import { describe, expect, it, vi } from "vitest";

const redirect = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect }));

const { default: HomePage } = await import("@/app/(staff)/staff/page");
const { default: RootPage } = await import("@/app/(staff)/page");

// Regression: opening "/" sends a signed-out Barista to /login?redirect=/. After sign-in the
// page returns to "/", which used to redirect to /login and force a second
// sign-in.
describe("POS home page", () => {
  it("opens the POS screen, never the sign-in page", () => {
    HomePage();
    expect(redirect).toHaveBeenCalledWith("/staff/pos");
  });

  // Why: one app serves both areas; the bare address must open the POS, never the Owner sign-in.
  it("sends the bare address to the POS", () => {
    RootPage();
    expect(redirect).toHaveBeenLastCalledWith("/staff/pos");
  });
});
