import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "@testing-library/react";

const nav = vi.hoisted(() => ({ replace: vi.fn(), redirect: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  redirect: nav.redirect,
}));
const auth = vi.hoisted(() => ({
  signOut: vi.fn(),
  requestPasswordRecovery: vi.fn(),
  verifyRecoveryCode: vi.fn(),
  resetPassword: vi.fn(),
}));
vi.mock("@/features/auth", () => auth);

import RestrictedPage from "@/app/restricted/page";
import ForgotPasswordPage from "@/app/(auth)/forgot-password/page";
import SetupRedirect from "@/app/(auth)/setup/page";

beforeEach(() => vi.clearAllMocks());

describe("Owner auth pages", () => {
  // Why: a Barista who reaches the Owner portal must be signed out here, not left with a session.
  it("restricted page signs the wrong account out and offers the way back", async () => {
    render(<RestrictedPage />);
    expect(screen.getByText("This portal is only for the Owner account.")).toBeInTheDocument();
    await waitFor(() => expect(auth.signOut).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole("button", { name: "Back to sign-in" }));
    expect(nav.replace).toHaveBeenCalledWith("/login");
  });

  // Why: password recovery is the Owner's only way back in; it must ask the server for a code.
  it("forgot-password asks for a recovery code for the Owner's email", async () => {
    auth.requestPasswordRecovery.mockResolvedValue(undefined);
    render(<ForgotPasswordPage />);
    await userEvent.type(screen.getByLabelText(/email/i), "owner@example.com");
    await userEvent.click(screen.getByRole("button", { name: /code|send|continue/i }));
    await waitFor(() => expect(auth.requestPasswordRecovery).toHaveBeenCalled());
    expect(auth.requestPasswordRecovery.mock.calls[0]?.[0]).toBe("owner@example.com");
  });

  // Why: there is no sign-up page; the old setup URL must land on sign-in.
  it("setup URL redirects to sign-in", () => {
    SetupRedirect();
    expect(nav.redirect).toHaveBeenCalledWith("/login");
  });
});
