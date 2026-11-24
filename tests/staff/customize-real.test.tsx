import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/react";
import { ADDON_CATALOG, addLine, lineTotal, type PosIngredient, type PosProduct } from "@/contracts/ui";
import { useCartStore } from "@/staff/features/pos/cart.store";
import { CustomizeModal } from "@/staff/features/pos/components/CustomizeModal";
import { toPosIngredient } from "@/staff/features/pos/api-mappers";
import { renderWithProviders } from "@/staff/test/render";

// Real mode (signed-in POS against the API), not the demo fixtures.
vi.mock("@/staff/lib/use-mocks", () => ({ USE_MOCKS: false }));

const at = "2026-11-19T00:00:00Z";
const ingredient = (id: number, name: string, stock: number, addon: { qty: number } | null) =>
  toPosIngredient({
    id, name, unit: "g", currentStock: stock, reorderLevel: 0,
    stockStatus: stock > 0 ? "available" : "out-of-stock", supplierId: null, supplierName: null, updatedAt: at,
    isAddon: !!addon, addonSellingPrice: addon ? 25 : null, addonQuantity: addon?.qty ?? null,
  });

const INGREDIENTS: PosIngredient[] = [
  ingredient(21, "Espresso Beans", 200, { qty: 18 }),
  ingredient(22, "Caramel Sauce", 10, { qty: 15 }), // less than one selection left
  ingredient(23, "Rice", 1000, null),
];

const product = (id: string, name: string, category: string, price: number): PosProduct => ({
  id, name, category, sellingPrice: price, isActive: true, createdAt: at,
});

function open(p: PosProduct, qty = 1) {
  const lines = addLine([], p, () => "line-1");
  lines[0]!.quantity = qty;
  useCartStore.setState({ lines });
  const onClose = vi.fn();
  const view = renderWithProviders(
    <CustomizeModal line={lines[0]!} product={p} stockById={{}} ingredients={INGREDIENTS} onClose={onClose} />,
  );
  return { onClose, view };
}

beforeEach(() => useCartStore.setState({ lines: [] }));

describe("customize modal, real mode add-ons from INGREDIENTS", () => {
  it("offers the configured add-ons at PHP 25.00 each, not the static demo menu or costs", () => {
    open(product("1", "Iced Spanish Latte", "Iced Coffee", 145));
    expect(screen.getByText("Add-ons — ₱25.00 each")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Espresso Beans · \+₱25\.00/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Caramel Sauce/ })).toBeDisabled();
    expect(screen.getByText("Not enough stock")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Rice/ })).not.toBeInTheDocument();
    for (const demo of ADDON_CATALOG) {
      expect(screen.queryByRole("button", { name: new RegExp(demo.label) })).not.toBeInTheDocument();
    }
    expect(screen.getByRole("dialog").textContent).not.toMatch(/cost/i);
  });

  it("offers the same list for every drink and none for food", () => {
    const names = (p: PosProduct) => {
      const { view } = open(p);
      const labels = screen.queryAllByRole("button", { name: /\+₱/ }).map((b) => b.textContent);
      view.unmount();
      return labels;
    };
    const iced = names(product("1", "Iced Spanish Latte", "Iced Coffee", 145));
    expect(iced).toHaveLength(2);
    expect(names(product("2", "Matcha", "Non-Coffee", 119))).toEqual(iced);
    open(product("3", "Tapsilog", "Silog Meals", 85));
    expect(screen.getByText("No add-ons for this item.")).toBeInTheDocument();
  });

  it("adds a selected add-on to the cart line as one PHP 25 selection per drink", async () => {
    const { onClose } = open(product("1", "Iced Spanish Latte", "Iced Coffee", 145), 2);
    await userEvent.click(screen.getByRole("button", { name: /Espresso Beans/ }));
    await userEvent.type(screen.getByLabelText("Customization"), "Sugar 50%");
    await userEvent.type(screen.getByLabelText("Special instructions"), "serve last");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    const line = useCartStore.getState().lines[0]!;
    expect(line.addons).toEqual([{ ingredientId: "21", label: "Espresso Beans", quantity: 1, price: 25 }]);
    expect(line.customization).toBe("Sugar 50%");
    expect(line.specialInstructions).toBe("serve last");
    expect(lineTotal(line)).toBe((145 + 25) * 2);
    expect(onClose).toHaveBeenCalled();
  });
});
