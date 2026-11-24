import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MOCK_SESSION_COOKIE, encodeMockSession } from "@gunita/auth";
import { mockRpc } from "@/lib/mock-db";
import { setSimulatedOffline } from "@/lib/connectivity";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/pos",
  useSearchParams: () => new URLSearchParams(),
}));

const pending = vi.hoisted(() => ({ count: 0 }));
vi.mock("@/offline/outbox", async (orig) => ({
  ...(await orig<typeof import("@/offline/outbox")>()),
  getOutboxCounts: async () => ({ pending: pending.count, failed: 0 }),
}));
vi.mock("@/offline/triggers", () => ({ initSyncTriggers: () => () => {} }));
vi.mock("@/offline/sync", () => ({ syncOutboxOrders: vi.fn(async () => {}) }));

const flags = vi.hoisted(() => ({ useMocks: true }));
vi.mock("@/lib/use-mocks", () => ({
  get USE_MOCKS() {
    return flags.useMocks;
  },
}));

import PosAppLayout from "@/app/(pos)/layout";

const LABELS = ["POS", "Orders", "Inventory"];

beforeEach(() => {
  flags.useMocks = true;
  pending.count = 0;
  document.cookie = `${MOCK_SESSION_COOKIE}=${encodeMockSession({ userId: "u2", role: "barista", fullName: "Bea Barista", username: "bea" })}; path=/`;
});

afterEach(() => {
  vi.unstubAllGlobals();
  setSimulatedOffline(false);
  document.cookie = `${MOCK_SESSION_COOKIE}=; path=/; Max-Age=0`;
});

describe("pos shell", () => {
  it("renders 3 nav links with POS current", () => {
    render(<PosAppLayout>content</PosAppLayout>);
    const side = screen.getAllByRole("navigation").find((n) => within(n).queryByText("Inventory"))!;
    const links = within(side).getAllByRole("link");
    expect(links).toHaveLength(3);
    links.forEach((l, i) => expect(l.textContent).toContain(LABELS[i]));
    expect(links[0]).toHaveAttribute("aria-current", "page");
  });

  it("shows the session name and Barista role", () => {
    render(<PosAppLayout>content</PosAppLayout>);
    expect(screen.getByText("Bea Barista")).toBeInTheDocument();
    expect(screen.getByText("Barista")).toBeInTheDocument();
  });

  it("Simulate offline toggles the offline banner", async () => {
    render(<PosAppLayout>content</PosAppLayout>);
    expect(screen.queryByText("Offline — orders are saved on this device")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "User menu" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Simulate offline" }));
    expect(await screen.findByText("Offline — orders are saved on this device")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "User menu" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Simulate offline" }));
    await waitFor(() => expect(screen.queryByText("Offline — orders are saved on this device")).not.toBeInTheDocument());
  });

  it("shows the pending count and a Sync now button", async () => {
    pending.count = 2;
    render(<PosAppLayout>content</PosAppLayout>);
    expect(await screen.findByText("2 to sync")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sync now" })).toBeInTheDocument();
  });

  it("resets demo data after confirm and hides Reset when mocks are off", async () => {
    const fetchMock = vi.fn(async () => ({ json: async () => ({ ok: true, data: null }) }) as Response);
    vi.stubGlobal("fetch", fetchMock);
    render(<PosAppLayout>content</PosAppLayout>);
    await userEvent.click(screen.getByRole("button", { name: "User menu" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Reset demo data" }));
    expect(await screen.findByText("Reset all demo data for both Owner and Barista?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    await waitFor(() => expect(screen.getByText("Demo data reset.")).toBeInTheDocument());
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ app: "pos", op: "reset", args: [] });
  });

  it("shows no user menu when USE_MOCKS is false; Log out stays", () => {
    flags.useMocks = false;
    render(<PosAppLayout>content</PosAppLayout>);
    expect(screen.queryByRole("button", { name: "User menu" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
  });
});

describe("mockRpc offline", () => {
  it("rejects listCatalog and syncOrders with Offline without calling fetch, while other ops go through", async () => {
    const fetchMock = vi.fn(async () => ({ json: async () => ({ ok: true, data: 1 }) }) as Response);
    vi.stubGlobal("fetch", fetchMock);
    setSimulatedOffline(true);
    await expect(mockRpc("listCatalog")).rejects.toThrow("Offline");
    await expect(mockRpc("syncOrders", {})).rejects.toThrow("Offline");
    expect(fetchMock).not.toHaveBeenCalled();
    setSimulatedOffline(false);
    await expect(mockRpc("listCatalog")).resolves.toBe(1);
  });
});
