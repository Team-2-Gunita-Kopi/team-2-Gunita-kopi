import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen, waitFor, within } from "@testing-library/react";
import type { UserProfile } from "@/contracts";
import { renderWithProviders } from "@/owner/test/render";

// Real mode: the users page against the (mocked) API modules.
vi.mock("@/owner/lib/use-mocks", () => ({ USE_MOCKS: false }));

const api = vi.hoisted(() => ({ listUsers: vi.fn(), updateUser: vi.fn(), setUserStatus: vi.fn() }));
vi.mock("@/owner/features/users/api", () => api);
const client = vi.hoisted(() => ({ apiClient: vi.fn() }));
vi.mock("@/owner/lib/api-client", () => client);

import UsersPage from "@/app/(owner)/admin/(app)/users/page";

const BARISTA: UserProfile = {
  id: 2, username: "testbarista", fullName: "Test Barista", role: "barista", status: "active", email: null,
  createdAt: "2026-11-21T00:00:00Z",
};
const OWNER: UserProfile = {
  id: 1, username: "testowner", fullName: "Test Owner", role: "owner_admin", status: "active",
  email: "owner@example.com", createdAt: "2026-11-21T00:00:00Z",
};

describe("Users page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listUsers.mockResolvedValue([OWNER, BARISTA]);
    client.apiClient.mockResolvedValue({ success: true, data: {} });
  });

  it("adds a user without any role field and always creates a barista", async () => {
    renderWithProviders(<UsersPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Add user" }));
    expect(screen.getByRole("heading", { name: "Add User" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/role/i)).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Full name"), "Ana Cruz");
    await userEvent.type(screen.getByLabelText("Username"), "ana");
    await userEvent.type(screen.getByLabelText(/^Password/), "secret123");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(client.apiClient).toHaveBeenCalledTimes(1));
    const [path, init] = client.apiClient.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/admin/employees");
    expect(JSON.parse(init.body as string)).toEqual({ username: "ana", password: "secret123", fullName: "Ana Cruz", role: "barista" });
    expect(await screen.findByRole("heading", { name: "Users" })).toBeInTheDocument();
    expect(await screen.findByText("Account created.")).toBeInTheDocument();
  });

  it("edits the name, username, status and password in one request but never the role", async () => {
    renderWithProviders(<UsersPage />);
    const editButtons = await screen.findAllByRole("button", { name: "Edit" });
    await userEvent.click(editButtons[1]!);
    expect(screen.getByRole("heading", { name: "Edit — Test Barista" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /role/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Current password")).not.toBeInTheDocument();
    const username = screen.getByLabelText("Username");
    await userEvent.clear(username);
    await userEvent.type(username, "juan");

    const name = screen.getByLabelText("Full name");
    await userEvent.clear(name);
    await userEvent.type(name, "Barista Two");
    await userEvent.selectOptions(screen.getByLabelText("Status"), "inactive");
    await userEvent.type(screen.getByLabelText("New password (blank = keep)"), "newpass123");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(api.updateUser).toHaveBeenCalledWith(2, {
        fullName: "Barista Two",
        username: "juan",
        status: "inactive",
        password: "newpass123",
      }),
    );
    expect(client.apiClient).not.toHaveBeenCalled();
    // Why: the form closes on success; the toast is the only sign the account was saved.
    expect(await screen.findByText("Account updated.")).toBeInTheDocument();
  });

  it("confirms and reports deactivating an account", async () => {
    api.setUserStatus.mockResolvedValue(BARISTA);
    renderWithProviders(<UsersPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Deactivate" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Deactivate" }));
    await waitFor(() => expect(api.setUserStatus).toHaveBeenCalledWith(2, "inactive"));
    expect(await screen.findByText("Test Barista deactivated.")).toBeInTheDocument();
  });

  it("asks the Owner for the current password before changing their own", async () => {
    renderWithProviders(<UsersPage />);
    const editButtons = await screen.findAllByRole("button", { name: "Edit" });
    await userEvent.click(editButtons[0]!);
    await userEvent.type(screen.getByLabelText("New password (blank = keep)"), "newpass123");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter your current password");
    expect(api.updateUser).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText("Current password"), "oldpass123");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(api.updateUser).toHaveBeenCalledWith(1, { password: "newpass123", currentPassword: "oldpass123" }),
    );
  });

  it("keeps the password when the field is left blank", async () => {
    renderWithProviders(<UsersPage />);
    const editButtons = await screen.findAllByRole("button", { name: "Edit" });
    await userEvent.click(editButtons[1]!);
    const name = screen.getByLabelText("Full name");
    await userEvent.clear(name);
    await userEvent.type(name, "Renamed");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.updateUser).toHaveBeenCalledWith(2, { fullName: "Renamed" }));
  });

  it("shows no status choice when editing the Owner", async () => {
    renderWithProviders(<UsersPage />);
    const editButtons = await screen.findAllByRole("button", { name: "Edit" });
    await userEvent.click(editButtons[0]!);
    expect(screen.queryByLabelText("Status")).not.toBeInTheDocument();
    expect(screen.getByText(/Role: Owner/)).toBeInTheDocument();
  });

  // Why: "Account updated." must mean something was saved.
  it("says there was nothing to save when no field changed", async () => {
    renderWithProviders(<UsersPage />);
    const editButtons = await screen.findAllByRole("button", { name: "Edit" });
    await userEvent.click(editButtons[1]!);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("No changes to save.")).toBeInTheDocument();
    expect(screen.queryByText("Account updated.")).not.toBeInTheDocument();
    expect(api.updateUser).not.toHaveBeenCalled();
  });
});
