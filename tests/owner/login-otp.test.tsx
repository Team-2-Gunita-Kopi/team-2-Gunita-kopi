import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/owner/test/render";
import { mockRouter } from "@/owner/test/setup";

// Real-mode Owner sign-in: the password only starts it; the page opens no route until the emailed
// code is accepted by the server.
const auth = vi.hoisted(() => ({
  signIn: vi.fn(),
  verifySignInCode: vi.fn(),
  resendSignInCode: vi.fn(),
}));
vi.mock("@/owner/features/auth", () => ({
  ...auth,
  requestPasswordRecovery: vi.fn(),
  verifyRecoveryCode: vi.fn(),
  resetPassword: vi.fn(),
}));

const { default: LoginPage } = await import("@/app/(owner)/admin/(auth)/login/page");

beforeEach(() => {
  vi.clearAllMocks();
  window.history.pushState({}, "", "/admin/login?redirect=%2Fadmin%2Forders");
  auth.signIn.mockResolvedValue({ otpRequired: true });
});

async function signInWithPassword() {
  renderWithProviders(<LoginPage />);
  await userEvent.type(screen.getByLabelText(/email or username/i), "owner@example.com");
  await userEvent.type(screen.getByLabelText(/^password$/i), "s3cret-pass");
  await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
}

describe("Owner emailed sign-in code", () => {
  it("asks for the code after the password and opens the page only after it is accepted", async () => {
    await signInWithPassword();
    expect(await screen.findByLabelText("Sign-in code")).toBeInTheDocument();
    expect(mockRouter.replace).not.toHaveBeenCalled();

    auth.verifySignInCode.mockRejectedValueOnce(new Error("That code is not valid or has expired."));
    await userEvent.type(screen.getByLabelText("Sign-in code"), "000000");
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByText("That code is not valid or has expired.")).toBeInTheDocument();
    expect(mockRouter.replace).not.toHaveBeenCalled();

    auth.verifySignInCode.mockResolvedValueOnce(undefined);
    await userEvent.clear(screen.getByLabelText("Sign-in code"));
    await userEvent.type(screen.getByLabelText("Sign-in code"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Verify" }));
    expect(auth.verifySignInCode).toHaveBeenLastCalledWith("123456");
    expect(mockRouter.replace).toHaveBeenCalledWith("/admin/orders");
  });

  it("sends a new code on request", async () => {
    await signInWithPassword();
    auth.resendSignInCode.mockResolvedValueOnce(undefined);
    await userEvent.click(await screen.findByRole("button", { name: "Send a new code" }));
    expect(auth.resendSignInCode).toHaveBeenCalledOnce();
    expect(await screen.findByText("A new code has been sent.")).toBeInTheDocument();
  });
});
