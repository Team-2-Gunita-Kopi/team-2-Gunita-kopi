import React from "react";
import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/react";

const nav = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

import RestrictedPage from "@/app/(staff)/staff/restricted/page";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

describe("POS restricted page and guard", () => {
  // Why: an Owner account on the POS gets a clear notice and a way back to the POS sign-in.
  it("explains the POS is for baristas and returns to sign-in", async () => {
    render(<RestrictedPage />);
    expect(screen.getByText("The Barista POS is only for barista accounts.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Back to sign-in" }));
    expect(nav.replace).toHaveBeenCalledWith("/staff/login");
  });

  // Why: the tab icon must load on the sign-in page, so it lives outside the guarded area; pages must not.
  it("guards pages but not the tab icon", async () => {
    const icon = await middleware(new NextRequest("http://shop.local/brand/gunita-kopi-icon.png"));
    expect(icon.headers.get("location")).toBeNull();
    const page = await middleware(new NextRequest("http://shop.local/staff/orders"));
    expect(page.headers.get("location")).toBe("http://shop.local/staff/login?redirect=%2Fstaff%2Forders");
  });
});
