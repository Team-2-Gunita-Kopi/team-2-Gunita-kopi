import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/staff/test/render";
import { mockRouter } from "@/staff/test/setup";
import { MOCK_SESSION_COOKIE } from "@/auth";
import LoginPage from "@/app/(staff)/staff/(auth)/login/page";

const USERS: Record<string, { password: string; role: string; fullName: string }> = {
  owner: { password: "owner123", role: "owner_admin", fullName: "Owner" },
  barista: { password: "barista123", role: "barista", fullName: "Barista" },
};

beforeEach(() => {
  document.cookie = `${MOCK_SESSION_COOKIE}=; path=/; Max-Age=0`;
  window.history.pushState({}, "", "/staff/login");
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
  await userEvent.type(screen.getByLabelText(/^username$/i), user);
  await userEvent.type(screen.getByLabelText(/^password$/i), pw);
  await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
}

describe("pos login", () => {
  it("shows the wrong-portal message for the Owner account", async () => {
    await login("owner", "owner123");
    expect(await screen.findByText("This is the Barista page. Please use the Owner portal for this account.")).toBeInTheDocument();
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(document.cookie).not.toContain(MOCK_SESSION_COOKIE);
  });

  it("shows the bad-credentials message", async () => {
    await login("barista", "nope");
    expect(await screen.findByText("Incorrect username or password.")).toBeInTheDocument();
  });

  it("sets the cookie and goes to /pos", async () => {
    await login("barista", "barista123");
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/staff/pos"));
    expect(document.cookie).toContain(MOCK_SESSION_COOKIE);
  });

  it("honours a same-app redirect param", async () => {
    window.history.pushState({}, "", "/staff/login?redirect=%2Fstaff%2Forders");
    await login("barista", "barista123");
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/staff/orders"));
  });

  it("ignores an off-site redirect param", async () => {
    window.history.pushState({}, "", "/staff/login?redirect=%2F%2Fevil.example");
    await login("barista", "barista123");
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/staff/pos"));
  });
  it.each(["%2F.%2F%2Fevil.example", "%2Fa%2F..%2F%2Fevil.example", "%2Flogin", "%2Fadmin%2Fdashboard", "%2F%5Cevil.example", "%2F%09%2Fevil.example", "%2F%0A%2Fevil.example"])(
    "ignores the tricky off-site redirect %s",
    async (enc) => {
      window.history.pushState({}, "", `/staff/login?redirect=${enc}`);
      await login("barista", "barista123");
      await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith("/staff/pos"));
    },
  );
});
