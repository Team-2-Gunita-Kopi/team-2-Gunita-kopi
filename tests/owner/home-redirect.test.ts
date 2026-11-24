import { describe, expect, it, vi } from "vitest";

const redirect = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect }));

const { default: HomePage } = await import("@/app/(owner)/admin/page");

// Regression: opening "/" sends a signed-out Owner to /login?redirect=/. After one password and
// one emailed code the page returns to "/", which used to redirect to /login and force a second
// sign-in.
describe("Admin home page", () => {
  it("opens the dashboard, never the sign-in page", () => {
    HomePage();
    expect(redirect).toHaveBeenCalledWith("/admin/dashboard");
  });
});
