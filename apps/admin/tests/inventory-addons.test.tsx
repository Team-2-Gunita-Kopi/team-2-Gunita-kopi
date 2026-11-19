import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { screen, waitFor, within } from "@testing-library/react";
import type { Ingredient } from "@gunita/contracts";
import { renderWithProviders } from "@/test/render";

// Real mode: the inventory page against the (mocked) API module.
vi.mock("@/lib/use-mocks", () => ({ USE_MOCKS: false }));

const api = vi.hoisted(() => ({
  listIngredients: vi.fn(),
  createIngredient: vi.fn(),
  updateIngredient: vi.fn(),
  listStockHistory: vi.fn(async () => []),
  recordStockIn: vi.fn(),
}));
vi.mock("@/features/inventory/api", async (importActual) => ({
  ...(await importActual<typeof import("@/features/inventory/api")>()),
  ...api,
}));
vi.mock("@/features/suppliers/api", () => ({ listSuppliers: async () => [] }));

import InventoryPage from "@/app/(app)/inventory/page";

const base = {
  currentStock: 200,
  reorderLevel: 20,
  stockStatus: "available" as const,
  supplierId: null,
  supplierName: null,
  updatedAt: "2026-11-19T00:00:00Z",
};
const BEANS: Ingredient = {
  ...base, id: 21, name: "Espresso Beans", unit: "g", unitCost: 1.2,
  isAddon: true, addonSellingPrice: 25, addonQuantity: 18,
};
const RICE: Ingredient = {
  ...base, id: 23, name: "Rice", unit: "g", unitCost: 0.05,
  isAddon: false, addonSellingPrice: null, addonQuantity: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  api.listIngredients.mockResolvedValue([BEANS, RICE]);
  api.createIngredient.mockResolvedValue(RICE);
  api.updateIngredient.mockResolvedValue(RICE);
});

async function openEdit(name: string) {
  renderWithProviders(<InventoryPage />);
  const row = (await screen.findByText(name)).closest("tr")!;
  await userEvent.click(within(row).getByRole("button", { name: "Edit" }));
  return screen.getByRole("dialog");
}

describe("Admin inventory: add-on configuration and costs", () => {
  it("keeps the Unit Cost column for the Owner", async () => {
    renderWithProviders(<InventoryPage />);
    expect(await screen.findByText("₱0.05/g")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Unit Cost" })).toBeInTheDocument();
  });

  it("Add Ingredient: unchecked by default, fixed PHP 25.00, quantity required and saved", async () => {
    renderWithProviders(<InventoryPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Add Ingredient" }));
    const dialog = screen.getByRole("dialog");
    const box = within(dialog).getByLabelText("Available as a POS add-on");
    expect(box).not.toBeChecked();
    expect(within(dialog).queryByLabelText(/Add-on selling price/)).not.toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText("Ingredient"), "Caramel Sauce");
    await userEvent.type(within(dialog).getByLabelText("Unit"), "ml");
    await userEvent.click(box);
    const price = within(dialog).getByLabelText("Add-on selling price (₱)");
    expect(price).toHaveValue("25.00");
    expect(price).toBeDisabled();

    // Zero is refused before anything is sent.
    await userEvent.type(within(dialog).getByLabelText("Quantity consumed per selection (ml)"), "0");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    const qty = within(dialog).getByLabelText("Quantity consumed per selection (ml)");
    expect(api.createIngredient).not.toHaveBeenCalled();
    expect(qty).toBeInvalid();

    await userEvent.clear(qty);
    await userEvent.type(qty, "15");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.createIngredient).toHaveBeenCalledTimes(1));
    const body = api.createIngredient.mock.calls[0]![0];
    expect(body).toMatchObject({ name: "Caramel Sauce", unit: "ml", isAddon: true, addonQuantity: 15 });
    expect(body).not.toHaveProperty("addonSellingPrice");
  });

  it("Add Ingredient unchecked saves a regular ingredient", async () => {
    renderWithProviders(<InventoryPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Add Ingredient" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Ingredient"), "Cups");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.createIngredient).toHaveBeenCalledTimes(1));
    expect(api.createIngredient.mock.calls[0]![0]).toMatchObject({ isAddon: false, addonQuantity: null });
  });

  it("Edit Ingredient loads an add-on configuration, and disabling it saves a regular ingredient", async () => {
    const dialog = await openEdit("Espresso Beans");
    expect(within(dialog).getByLabelText("Available as a POS add-on")).toBeChecked();
    expect(within(dialog).getByLabelText("Add-on selling price (₱)")).toHaveValue("25.00");
    expect(within(dialog).getByLabelText("Quantity consumed per selection (g)")).toHaveValue(18);
    // Opening stock is not part of the edit form; stock changes only through stock movements.
    expect(within(dialog).queryByLabelText(/stock/i)).not.toBeInTheDocument();

    await userEvent.click(within(dialog).getByLabelText("Available as a POS add-on"));
    expect(within(dialog).queryByLabelText(/Quantity consumed/)).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.updateIngredient).toHaveBeenCalledTimes(1));
    const [id, body] = api.updateIngredient.mock.calls[0]!;
    expect(id).toBe(21);
    expect(body).toMatchObject({ isAddon: false, addonQuantity: null, unitCost: 1.2 });
    expect(body).not.toHaveProperty("currentStock");
  });

  it("Edit Ingredient of a regular ingredient hides the add-on fields", async () => {
    const dialog = await openEdit("Rice");
    expect(within(dialog).getByLabelText("Available as a POS add-on")).not.toBeChecked();
    expect(within(dialog).queryByLabelText(/Add-on selling price/)).not.toBeInTheDocument();
  });
});
