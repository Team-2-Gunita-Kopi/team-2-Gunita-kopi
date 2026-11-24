import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MOCK_SESSION_COOKIE, encodeMockSession } from "@/auth";
import { mockRpc } from "@/owner/lib/mock-db";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/admin/dashboard",
  useSearchParams: () => new URLSearchParams(),
}));

const flags = vi.hoisted(() => ({ useMocks: true }));
vi.mock("@/owner/lib/use-mocks", () => ({
  get USE_MOCKS() {
    return flags.useMocks;
  },
}));


// Records the idle sign-out the layout configures (the real IdleLogout still renders).
const idle = vi.hoisted(() => ({ timeoutMs: 0 }));
vi.mock("@/ui", async (orig) => {
  const ui = await orig<typeof import("@/ui")>();
  const IdleLogout = (p: React.ComponentProps<typeof ui.IdleLogout>) => {
    idle.timeoutMs = p.timeoutMs;
    return React.createElement(ui.IdleLogout, p);
  };
  return { ...ui, IdleLogout };
});

import AdminAppLayout from "@/app/(owner)/admin/(app)/layout";

const LABELS = ["Dashboard", "Orders", "Products", "Inventory", "Suppliers", "Reports", "Users"];

function setSession() {
  document.cookie = `${MOCK_SESSION_COOKIE}=${encodeMockSession({ userId: "u1", role: "owner_admin", fullName: "Olivia Owner", username: "owner" })}; path=/`;
}

beforeEach(() => {
  flags.useMocks = true;
  setSession();
  window.history.pushState({}, "", "/admin/dashboard");
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = `${MOCK_SESSION_COOKIE}=; path=/; Max-Age=0`;
});

describe("owner shell", () => {
  // Why (decided 2026-11-24): the Owner portal handles money and staff accounts, so it signs out
  // after the common 30-minute idle standard, not every 5 minutes.
  it("signs the Owner out after 30 idle minutes", async () => {
    render(<AdminAppLayout>content</AdminAppLayout>);
    await waitFor(() => expect(idle.timeoutMs).toBe(30 * 60 * 1000));
  });

  it("renders 7 nav links in order with Dashboard current", () => {
    render(<AdminAppLayout>content</AdminAppLayout>);
    const side = screen.getAllByRole("navigation").find((n) => within(n).queryByText("Dashboard"))!;
    const links = within(side).getAllByRole("link");
    expect(links).toHaveLength(LABELS.length);
    links.forEach((l, i) => expect(l.textContent).toContain(LABELS[i]));
    expect(links[0]).toHaveAttribute("aria-current", "page");
    expect(links.filter((l) => l.getAttribute("aria-current") === "page")).toHaveLength(1);
  });

  it("shows the session name and Owner role", () => {
    render(<AdminAppLayout>content</AdminAppLayout>);
    expect(screen.getByText("Olivia Owner")).toBeInTheDocument();
    expect(screen.getByText("Owner")).toBeInTheDocument();
  });

  it("offers Reset demo data only when mocks are on, and resets after confirm", async () => {
    const fetchMock = vi.fn(async () => ({ json: async () => ({ ok: true, data: null }) }) as Response);
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminAppLayout>content</AdminAppLayout>);
    await userEvent.click(screen.getByRole("button", { name: "User menu" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Reset demo data" }));
    expect(await screen.findByText("Reset all demo data for both Owner and Barista?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    await waitFor(() => expect(screen.getByText("Demo data reset.")).toBeInTheDocument());
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ app: "owner", op: "reset", args: [] });
  });

  it("shows no user menu when USE_MOCKS is false; Log out stays", () => {
    flags.useMocks = false;
    render(<AdminAppLayout>content</AdminAppLayout>);
    expect(screen.queryByRole("button", { name: "User menu" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
  });
});

describe("mockRpc", () => {
  it("posts the owner op and args", async () => {
    const fetchMock = vi.fn(async () => ({ json: async () => ({ ok: true, data: [1] }) }) as Response);
    vi.stubGlobal("fetch", fetchMock);
    await expect(mockRpc("listOrders", {})).resolves.toEqual([1]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/mock\/rpc$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ app: "owner", op: "listOrders", args: [{}] });
  });

  it("rpc network error shows service message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(mockRpc("listOrders", {})).rejects.toThrow("Can't reach the demo data service.");
  });

  it("throws the server error message for {ok:false}", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({ ok: false, error: { code: "X", message: "Nope" } }) }) as Response));
    await expect(mockRpc("listOrders")).rejects.toThrow("Nope");
  });

  it("?mockFail=<op> rejects without calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/admin/orders?mockFail=listOrders");
    await expect(mockRpc("listOrders", {})).rejects.toThrow("Mock failure (listOrders)");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
