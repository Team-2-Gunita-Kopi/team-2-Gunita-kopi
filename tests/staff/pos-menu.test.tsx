import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen, waitFor, within } from "@testing-library/react";
import { createOwnerMockDb, createPosView } from "@/mocks/owner";
import type { PosCatalog } from "@/staff/features/pos";
import { useCartStore } from "@/staff/features/pos/cart.store";
import { renderWithProviders } from "@/staff/test/render";
import PosPage from "@/app/(staff)/staff/(pos)/pos/page";

function seedCatalog(mutate?: (c: PosCatalog) => void): PosCatalog {
  const db = createOwnerMockDb({ storage: null, now: () => new Date("2026-11-03T06:00:00Z") });
  const catalog = createPosView(db).listCatalog() as PosCatalog;
  mutate?.(catalog);
  return catalog;
}

function stubCatalog(catalog: PosCatalog) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ json: async () => ({ ok: true, data: catalog }) }) as Response),
  );
}

async function renderPos(catalog = seedCatalog()) {
  stubCatalog(catalog);
  renderWithProviders(<PosPage />);
  await screen.findByRole("button", { name: /^Iced Spanish Latte/ });
  return catalog;
}

const tile = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}`) });

beforeEach(() => useCartStore.setState({ lines: [] }));
afterEach(() => vi.unstubAllGlobals());

describe("pos menu", () => {
  it("search 'ube' (debounced) shows only Iced Ube Latte", async () => {
    await renderPos();
    await userEvent.type(screen.getByRole("searchbox", { name: "Search menu" }), "ube");
    await waitFor(() => expect(screen.queryByRole("button", { name: /^Iced Spanish Latte/ })).not.toBeInTheDocument());
    expect(tile("Iced Ube Latte")).toBeInTheDocument();
    expect(document.querySelectorAll(".menu-grid .menu-item")).toHaveLength(1);
    expect(screen.getByRole("searchbox", { name: "Search menu" })).toHaveFocus();
  });

  it("Rice Meals tab filters to that category", async () => {
    const catalog = await renderPos();
    await userEvent.click(screen.getByRole("button", { name: /Rice Meals/ }));
    const rice = catalog.products.filter((p) => p.category === "Rice Meals");
    expect(rice.length).toBeGreaterThan(0);
    expect(document.querySelectorAll(".menu-grid .menu-item")).toHaveLength(rice.length);
    rice.forEach((p) => expect(screen.getByText(p.name)).toBeInTheDocument());
    expect(screen.queryByText("Iced Ube Latte")).not.toBeInTheDocument();
  });

  it("an out-of-stock tile is aria-disabled, shows the chip and ignores taps", async () => {
    await renderPos(
      seedCatalog((c) => {
        const ube = c.ingredients.find((i) => i.id === "i-ube")!;
        ube.currentStock = 0;
      }),
    );
    const ube = tile("Iced Ube Latte");
    expect(ube).toHaveAttribute("aria-disabled", "true");
    expect(within(ube).getByText("Out of stock")).toBeInTheDocument();
    await userEvent.click(ube);
    expect(useCartStore.getState().lines).toHaveLength(0);
    expect(screen.getByText("No items yet.")).toBeInTheDocument();
  });

  it("does not show an inactive product", async () => {
    await renderPos(
      seedCatalog((c) => {
        c.products.find((p) => p.name === "Iced Ube Latte")!.isActive = false;
      }),
    );
    expect(screen.queryByRole("button", { name: /^Iced Ube Latte/ })).not.toBeInTheDocument();
  });

  it("blocks checkout when a cart product becomes unavailable", async () => {
    const catalog = seedCatalog();
    const product = catalog.products.find((p) => p.name === "Iced Spanish Latte")!;
    let active = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        json: async () => ({
          ok: true,
          data: active
            ? catalog
            : { ...catalog, products: catalog.products.filter((p) => p.id !== product.id) },
        }),
      }) as Response),
    );
    renderWithProviders(<PosPage />);
    await screen.findByRole("button", { name: /^Iced Spanish Latte/ });
    await userEvent.click(tile("Iced Spanish Latte"));
    await userEvent.click(screen.getByRole("button", { name: /^Charge/ }));
    await userEvent.type(screen.getByLabelText("Amount paid"), "500");
    active = false;
    await userEvent.click(screen.getByRole("button", { name: "Confirm payment" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Iced Spanish Latte is no longer available. Remove it from the cart.",
    );
    expect(screen.queryByRole("dialog", { name: "Receipt" })).not.toBeInTheDocument();
  });

  it("tapping a tile twice makes one line with qty 2 and Charge ₱290.00", async () => {
    await renderPos();
    await userEvent.click(tile("Iced Spanish Latte"));
    await userEvent.click(tile("Iced Spanish Latte"));
    const lines = useCartStore.getState().lines;
    expect(lines).toHaveLength(1);
    expect(lines[0]!.quantity).toBe(2);
    expect(screen.getByRole("button", { name: "Charge ₱290.00" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Cart · 2 · ₱290.00" })).toBeInTheDocument();
  });

  it("stepper and remove edit the cart", async () => {
    await renderPos();
    await userEvent.click(tile("Iced Spanish Latte"));
    await userEvent.click(screen.getByRole("button", { name: "Increase Iced Spanish Latte" }));
    expect(useCartStore.getState().lines[0]!.quantity).toBe(2);
    await userEvent.click(screen.getByRole("button", { name: "Decrease Iced Spanish Latte" }));
    expect(useCartStore.getState().lines[0]!.quantity).toBe(1);
    await userEvent.click(screen.getByRole("button", { name: "Remove Iced Spanish Latte" }));
    expect(useCartStore.getState().lines).toHaveLength(0);
  });

  it("Clear asks for confirmation and empties the cart", async () => {
    await renderPos();
    await userEvent.click(tile("Iced Spanish Latte"));
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(await screen.findByText("Clear all items?")).toBeInTheDocument();
    expect(useCartStore.getState().lines).toHaveLength(1);
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Clear" }));
    await waitFor(() => expect(useCartStore.getState().lines).toHaveLength(0));
    expect(screen.getByText("No items yet.")).toBeInTheDocument();
  });

  it("cancelling the Clear confirmation keeps the cart", async () => {
    await renderPos();
    await userEvent.click(tile("Iced Spanish Latte"));
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(useCartStore.getState().lines).toHaveLength(1);
  });

  it("empty cart shows 'No items yet.' and a disabled Charge", async () => {
    await renderPos();
    expect(screen.getByText("No items yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Charge ₱0.00" })).toBeDisabled();
  });

  it("the cart FAB toggles the slide-up sheet", async () => {
    await renderPos();
    const panel = screen.getByRole("complementary", { name: "Cart" });
    expect(panel).not.toHaveClass("open");
    await userEvent.click(screen.getByRole("button", { name: "Cart · 0 · ₱0.00" }));
    expect(panel).toHaveClass("open");
  });

  it("shows the error message and retries when the catalog fails to load", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({ ok: false, error: { code: "X", message: "boom" } }) }) as Response));
    renderWithProviders(<PosPage />);
    expect(await screen.findByText("No saved menu yet. Connect to the internet once to download it.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});

describe("pos customize wiring", () => {
  it("Customize on a cart line opens the modal for that product", async () => {
    await renderPos();
    await userEvent.click(tile("Iced Spanish Latte"));
    await userEvent.click(screen.getByRole("button", { name: "Customize" }));
    expect(await screen.findByRole("dialog", { name: /Customize — Iced Spanish Latte/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
