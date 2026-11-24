import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen, waitFor, within } from "@testing-library/react";
import type { Ingredient } from "@/contracts";
import { renderWithProviders } from "@/owner/test/render";

// Real mode: the inventory page against the (mocked) API module.
vi.mock("@/owner/lib/use-mocks", () => ({ USE_MOCKS: false }));

const api = vi.hoisted(() => ({
  listIngredients: vi.fn(),
  listStockHistory: vi.fn(async () => []),
  listIngredientProducts: vi.fn(),
  deleteIngredient: vi.fn(),
  recordStockMovement: vi.fn(async (_input: { ingredientId: number }) => ({})),
}));
vi.mock("@/owner/features/inventory/api", async (importActual) => ({
  ...(await importActual<typeof import("@/owner/features/inventory/api")>()),
  ...api,
}));
vi.mock("@/owner/features/suppliers/api", () => ({ listSuppliers: async () => [] }));

import InventoryPage from "@/app/(owner)/admin/(app)/inventory/page";

const BEANS: Ingredient = {
  id: 21, name: "Espresso Beans", unit: "g", currentStock: 200, reorderLevel: 20, unitCost: 1.2,
  stockStatus: "available", supplierId: null, supplierName: null, updatedAt: "2026-11-19T00:00:00Z",
  isAddon: false, addonSellingPrice: null, addonQuantity: null,
};
const RICE: Ingredient = { ...BEANS, id: 23, name: "Rice" };

beforeEach(() => {
  vi.clearAllMocks();
  api.listIngredients.mockResolvedValue([BEANS]);
  api.listIngredientProducts.mockResolvedValue([{ id: 7, name: "Latte" }, { id: 9, name: "Mocha" }]);
  api.deleteIngredient.mockResolvedValue({ id: 21, removedFromProducts: [{ id: 7, name: "Latte" }, { id: 9, name: "Mocha" }] });
});

async function clickDelete() {
  renderWithProviders(<InventoryPage />);
  const row = (await screen.findByText("Espresso Beans")).closest("tr")!;
  await userEvent.click(within(row).getByRole("button", { name: "Delete Espresso Beans" }));
  return screen.findByRole("dialog");
}

describe("Admin inventory: delete an ingredient", () => {
  // Why: delete cannot be undone from the app, and it changes recipes, so the Owner must read both
  // before confirming (R11), and must see that it worked.
  it("warns that it cannot be undone, lists the affected products, deletes on confirm and says so", async () => {
    const dialog = await clickDelete();
    expect(await within(dialog).findByText(/cannot be undone/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/Latte, Mocha/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(api.deleteIngredient).toHaveBeenCalledWith(21));
    expect(await screen.findByText("Espresso Beans deleted.")).toBeInTheDocument();
  });

  it("does nothing when the Owner cancels", async () => {
    const dialog = await clickDelete();
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(api.deleteIngredient).not.toHaveBeenCalled();
  });

  // Why: a failed delete must not look like a success.
  it("shows the API error as an error toast", async () => {
    api.deleteIngredient.mockRejectedValue(new Error("Ingredient not found"));
    const dialog = await clickDelete();
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Could not delete Espresso Beans: Ingredient not found")).toBeInTheDocument();
  });

  // Why: an add-on disappears from the POS when deleted; the Owner must know before confirming.
  it("warns that an add-on will no longer be offered", async () => {
    api.listIngredients.mockResolvedValue([{ ...BEANS, isAddon: true, addonSellingPrice: 25, addonQuantity: 18 }]);
    const dialog = await clickDelete();
    expect(await within(dialog).findByText(/no longer be offered as an add-on/i)).toBeInTheDocument();
  });

  // Why: Stock In/Out preselects the first ingredient; after deleting it, a save must not go to
  // the deleted ingredient (the Owner would get "Ingredient not found").
  it("moves Stock In / Out off a deleted ingredient", async () => {
    api.listIngredients.mockResolvedValue([BEANS, RICE]);
    api.deleteIngredient.mockImplementation(async () => {
      api.listIngredients.mockResolvedValue([RICE]);
      return { id: 21, removedFromProducts: [] };
    });
    const dialog = await clickDelete();
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await screen.findByText("Espresso Beans deleted.");
    await waitFor(() => expect(screen.queryByText("Espresso Beans")).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole("tab", { name: "Stock In / Out" }));
    await userEvent.type(screen.getByLabelText("Quantity"), "10");
    await userEvent.click(screen.getByRole("button", { name: "Save transaction" }));
    await waitFor(() => expect(api.recordStockMovement).toHaveBeenCalledTimes(1));
    expect(api.recordStockMovement.mock.calls[0]![0]).toMatchObject({ ingredientId: 23 });
  });
});
