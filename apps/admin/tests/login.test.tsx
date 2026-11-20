import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { mockRouter } from "@/test/setup";
import { MOCK_SESSION_COOKIE } from "@gunita/auth";
import LoginPage from "@/app/(auth)/login/page";

const USERS: Record<string, { password: string; role: string; fullName: string }> = {
  owner: { password: "owner123", role: "owner_admin", fullName: "Owner" },
  barista: { password: "barista123", role: "barista", fullName: "Barista" },
};

beforeEach(() => {
  document.cookie = `${MOCK_SESSION_COOKIE}=; path=/; Max-Age=0`;
  window.history.pushState({}, "", "/login");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      const { args } = JSON.parse(init.body as string) as { args: [string, string] };
      const u = USERS[args[0]];
      const data =
        u && u.password === args[1]
          ? { id: args[0], authUserId: args[0], email: "x@y.z", fullName: u.fullName, username: args[0], role: u.role, isActive: true, createdAt: "" }
          : null;
      return { json: async () => ({ ok: true, data }) } as Response;
    }),
  );
});

async function login(user: string, pw: string) {
  renderWithProviders(<LoginPage />);
  await userEvent.type(screen.getByLabelText(/email or username/i), user);
  await userEvent.type(screen.getByLabelText(/^password$/i), pw);
  await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
}

describe("admin login", () => {
  it("shows the wrong-portal message for the Barista account", async () => {
    await login("barista", "barista123");
    expect(await screen.findByText("This is the Owner page. Please use the Barista POS for this account.")).toBeInTheDocument();
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(document.cookie).not.toContain(MOCK_SESSION_COOKIE);
  });

  it("shows the bad-credentials message", async () => {
    await login("owner", "nope");
    expect(await screen.findByText("Incorrect username or password.")).toBeInTheDocument();
  });

  it("sets the cookie and goes to /dashboard", async () => {
    await login("owner", "owner123");
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/dashboard"));
    expect(document.cookie).toContain(MOCK_SESSION_COOKIE);
  });

  it("honours a same-app redirect param", async () => {
    window.history.pushState({}, "", "/login?redirect=%2Forders");
    await login("owner", "owner123");
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/orders"));
  });

  it("ignores an off-site redirect param", async () => {
    window.history.pushState({}, "", "/login?redirect=%2F%2Fevil.example");
    await login("owner", "owner123");
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/dashboard"));
  });
  it.each(["%2F.%2F%2Fevil.example", "%2Fa%2F..%2F%2Fevil.example", "%2Flogin", "%2F%5Cevil.example", "%2F%09%2Fevil.example", "%2F%0A%2Fevil.example"])(
    "ignores the tricky off-site redirect %s",
    async (enc) => {
      window.history.pushState({}, "", `/login?redirect=${enc}`);
      await login("owner", "owner123");
      await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/dashboard"));
    },
  );
});

describe("admin login links", () => {
  it("opens Forgot password and returns to sign in", async () => {
    renderWithProviders(<LoginPage />);
    await userEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
    expect(screen.getByText("Forgot password")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "← Back to sign in" }));
    expect(screen.getByRole("button", { name: /^sign in$/i })).toBeInTheDocument();
  });

  it("opens Create account", async () => {
    renderWithProviders(<LoginPage />);
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(screen.getByLabelText("Full name")).toBeInTheDocument();
    expect(screen.queryByLabelText("Setup code")).not.toBeInTheDocument();
    expect(screen.getByText("Initial Owner registration only. Registration closes after setup.")).toBeInTheDocument();
  });
});
