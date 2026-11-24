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

import RestrictedPage from "@/app/restricted/page";
import { config } from "@/middleware";

describe("POS restricted page and guard", () => {
  // Why: an Owner account on the POS gets a clear notice and a way back to the POS sign-in.
  it("explains the POS is for baristas and returns to sign-in", async () => {
    render(<RestrictedPage />);
    expect(screen.getByText("The Barista POS is only for barista accounts.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Back to sign-in" }));
    expect(nav.replace).toHaveBeenCalledWith("/login");
  });

  // Why: the app icon must load on the sign-in page, so it skips the sign-in guard; pages must not.
  it("guards pages but not the app icon", () => {
    const guarded = new RegExp(`^${config.matcher[0]}$`);
    expect(guarded.test("/icon.svg")).toBe(false);
    expect(guarded.test("/pos")).toBe(true);
    expect(guarded.test("/orders")).toBe(true);
  });
});
