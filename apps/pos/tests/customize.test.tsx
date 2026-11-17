import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen, waitFor } from "@testing-library/react";
import { createOwnerMockDb, createPosView } from "@gunita/mocks/owner";
import { addLine, lineTotal, type OrderAddon } from "@gunita/contracts";
import type { PosCatalog } from "@/features/pos";
import { useCartStore } from "@/features/pos/cart.store";
import { CustomizeModal } from "@/features/pos/components/CustomizeModal";
import { renderWithProviders } from "@/test/render";

function seedCatalog(): PosCatalog {
  const db = createOwnerMockDb({ storage: null, now: () => new Date("2026-11-03T06:00:00Z") });
  return createPosView(db).listCatalog() as PosCatalog;
}

function setup(opts: { category: string; stock?: (s: Record<string, number>) => void; qty?: number; addons?: OrderAddon[] }) {
  const catalog = seedCatalog();
  const product = catalog.products.find((p) => p.category === opts.category && (p.ingredients ?? []).some((i) => i.ingredientId === "i-beans")) ?? catalog.products.find((p) => p.category === opts.category)!;
  const stockById = Object.fromEntries(catalog.ingredients.map((i) => [i.id, i.currentStock]));
  opts.stock?.(stockById);
  const lines = addLine([], product, () => "line-1");
  lines[0]!.quantity = opts.qty ?? 1;
  lines[0]!.addons = opts.addons ?? [];
  useCartStore.setState({ lines });
  const onClose = vi.fn();
  renderWithProviders(<CustomizeModal line={lines[0]!} product={product} stockById={stockById} onClose={onClose} />);
  return { product, onClose };
}

beforeEach(() => useCartStore.setState({ lines: [] }));
afterEach(() => vi.unstubAllGlobals());

describe("customize modal", () => {
  it("Hot Beverages shows Extra milk but not syrups", () => {
    setup({ category: "Hot Beverages" });
    expect(screen.getByRole("dialog")).toHaveAccessibleName(/Customize/);
    expect(screen.getByRole("button", { name: /Extra milk/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /syrup/ })).not.toBeInTheDocument();
  });

  it("Extra shot + chip Sugar 50% + Save updates the line and total by 25 x qty", async () => {
    const { onClose } = setup({ category: "Hot Beverages", qty: 2 });
    const before = lineTotal(useCartStore.getState().lines[0]!);
    await userEvent.click(screen.getByRole("button", { name: /Extra shot/ }));
    await userEvent.click(screen.getByRole("button", { name: "Sugar 50%" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    const line = useCartStore.getState().lines[0]!;
    expect(line.addons.map((a) => a.label)).toEqual(["Extra shot"]);
    expect(line.customization).toBe("Sugar 50%");
    expect(lineTotal(line) - before).toBe(50);
    expect(onClose).toHaveBeenCalled();
  });

  it("chips append comma-separated and toggle off", async () => {
    setup({ category: "Hot Beverages" });
    await userEvent.click(screen.getByRole("button", { name: "Sugar 50%" }));
    await userEvent.click(screen.getByRole("button", { name: "Extra hot" }));
    expect(screen.getByLabelText("Customization")).toHaveValue("Sugar 50%, Extra hot");
    await userEvent.click(screen.getByRole("button", { name: "Sugar 50%" }));
    expect(screen.getByLabelText("Customization")).toHaveValue("Extra hot");
  });

  it("a disabled add-on shows Not enough stock and can't be toggled", async () => {
    setup({ category: "Hot Beverages", stock: (s) => (s["i-milk"] = 0) });
    const milk = screen.getByRole("button", { name: /Extra milk/ });
    expect(milk).toBeDisabled();
    expect(screen.getByText("Not enough stock")).toBeInTheDocument();
    await userEvent.click(milk);
    expect(milk).toHaveAttribute("aria-pressed", "false");
  });

  it("shows add-on prices as pesos", () => {
    setup({ category: "Hot Beverages" });
    expect(screen.getByRole("button", { name: /Extra shot · \+₱25\.00/ })).toBeInTheDocument();
  });

  it("an already-selected add-on that is now out of stock can still be removed", async () => {
    setup({
      category: "Hot Beverages",
      stock: (st) => (st["i-milk"] = 0),
      addons: [{ ingredientId: "i-milk", label: "Extra milk", quantity: 60, price: 15 }],
    });
    const milk = screen.getByRole("button", { name: /Extra milk/ });
    expect(milk).toBeEnabled();
    expect(milk).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(milk);
    expect(milk).toHaveAttribute("aria-pressed", "false");
    expect(milk).toBeDisabled();
  });

  it("renders <b>hi</b> in instructions literally", async () => {
    setup({ category: "Hot Beverages" });
    await userEvent.type(screen.getByLabelText("Special instructions"), "<b>hi</b>");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(useCartStore.getState().lines[0]!.specialInstructions).toBe("<b>hi</b>");
    await waitFor(() => expect(document.querySelector("b")).toBeNull());
  });
});
