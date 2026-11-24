import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { Ingredient, StockTransaction } from "@/contracts";
import { renderWithProviders } from "@/owner/test/render";

// Real mode: the inventory page against the (mocked) API module.
vi.mock("@/owner/lib/use-mocks", () => ({ USE_MOCKS: false }));

const api = vi.hoisted(() => ({
  listIngredients: vi.fn(),
  createIngredient: vi.fn(),
  updateIngredient: vi.fn(),
  listStockHistory: vi.fn<
    (filters?: { ingredientId?: string; from?: string; to?: string }) => Promise<StockTransaction[]>
  >(async () => []),
  recordStockMovement: vi.fn(),
}));
vi.mock("@/owner/features/inventory/api", async (importActual) => ({
  ...(await importActual<typeof import("@/owner/features/inventory/api")>()),
  ...api,
}));
vi.mock("@/owner/features/suppliers/api", () => ({ listSuppliers: async () => [] }));

import InventoryPage from "@/app/(owner)/admin/(app)/inventory/page";

const base = {
  currentStock: 200,
  reorderLevel: 20,
  stockStatus: "available" as const,
  supplierId: null,
  supplierName: null,
  updatedAt: "2026-11-19T00:00:00Z",
};
const BEANS: Ingredient = {
  ...base, id: 21, name: "Espresso Beans", unit: "g", unitCost: 1.2, supplierName: "Local Roasters",
  isAddon: true, addonSellingPrice: 25, addonQuantity: 18,
};
const RICE: Ingredient = {
  ...base, id: 23, name: "Rice", unit: "g", unitCost: 0.05, supplierName: "Farm Supply",
  isAddon: false, addonSellingPrice: null, addonQuantity: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  api.listIngredients.mockResolvedValue([BEANS, RICE]);
  api.createIngredient.mockResolvedValue(RICE);
  api.updateIngredient.mockResolvedValue(RICE);
  api.recordStockMovement.mockResolvedValue({});
});

async function openEdit(name: string) {
  renderWithProviders(<InventoryPage />);
  const row = (await screen.findByText(name)).closest("tr")!;
  await userEvent.click(within(row).getByRole("button", { name: `Edit ${name}` }));
  return screen.getByRole("dialog");
}

describe("Admin inventory: add-on configuration and costs", () => {
  it("keeps the Unit Cost column for the Owner", async () => {
    renderWithProviders(<InventoryPage />);
    expect(await screen.findByText("₱0.05")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Unit Cost" })).toBeInTheDocument();
  });

  it("Add Ingredient: unchecked by default, fixed PHP 25.00, quantity required and saved", async () => {
    renderWithProviders(<InventoryPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Add ingredient" }));
    const dialog = screen.getByRole("dialog");
    const box = within(dialog).getByLabelText("Available as a POS add-on");
    expect(box).not.toBeChecked();
    expect(within(dialog).queryByLabelText(/Add-on selling price/)).not.toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText("Name"), "Caramel Sauce");
    await userEvent.selectOptions(within(dialog).getByLabelText("Unit"), "ml");
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
    await userEvent.click(await screen.findByRole("button", { name: "Add ingredient" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Name"), "Cups");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.createIngredient).toHaveBeenCalledTimes(1));
    expect(api.createIngredient.mock.calls[0]![0]).toMatchObject({ isAddon: false, addonQuantity: null });
    // Why: the dialog closes on success; without a toast the Owner cannot tell it was saved.
    expect(await screen.findByText("Cups added.")).toBeInTheDocument();
  });

  it("Add Ingredient records the opening stock as a stock-in, and none when it is 0", async () => {
    renderWithProviders(<InventoryPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Add ingredient" }));
    let dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Unit")).toHaveValue("g");
    await userEvent.type(within(dialog).getByLabelText("Name"), "Rice");
    const opening = within(dialog).getByLabelText("Opening stock");
    await userEvent.clear(opening);
    await userEvent.type(opening, "500");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(api.recordStockMovement).toHaveBeenCalledWith({
        ingredientId: 23, type: "in", quantity: 500, remarks: "Opening stock",
      }),
    );

    api.recordStockMovement.mockClear();
    await userEvent.click(screen.getByRole("button", { name: "Add ingredient" }));
    dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Name"), "Cups");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.createIngredient).toHaveBeenCalledTimes(2));
    expect(api.recordStockMovement).not.toHaveBeenCalled();
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
    expect(await screen.findByText("Espresso Beans updated.")).toBeInTheDocument();
  });

  it("Edit Ingredient of a regular ingredient hides the add-on fields", async () => {
    const dialog = await openEdit("Rice");
    expect(within(dialog).getByLabelText("Available as a POS add-on")).not.toBeChecked();
    expect(within(dialog).queryByLabelText(/Add-on selling price/)).not.toBeInTheDocument();
  });

  it("shows ingredient IDs and suppliers, and opens row-specific stock and history views", async () => {
    renderWithProviders(<InventoryPage />);
    expect(await screen.findByRole("columnheader", { name: "ID" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Supplier" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Actions" })).toBeInTheDocument();

    let row = (await screen.findByText("Rice")).closest("tr")!;
    expect(within(row).getByText("23")).toBeInTheDocument();
    expect(within(row).getByText("Farm Supply")).toBeInTheDocument();
    await userEvent.click(within(row).getByRole("button", { name: "Stock In/Out" }));
    expect(screen.getByLabelText("Ingredient")).toHaveValue("23");

    await userEvent.click(screen.getByRole("tab", { name: "Ingredient List" }));
    row = (await screen.findByText("Rice")).closest("tr")!;
    await userEvent.click(within(row).getByRole("button", { name: "History" }));
    expect(screen.getByRole("tab", { name: "Stock History" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByLabelText("Ingredient")).toHaveValue("23");
  });

  it("records stock-in and stock-out for the selected ingredient", async () => {
    renderWithProviders(<InventoryPage />);
    await userEvent.click(
      await screen.findByRole("tab", { name: "Stock In / Out" }),
    );
    expect(await screen.findByText("200 g")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Quantity"), "10");
    await userEvent.type(screen.getByLabelText("Remarks"), "delivery");
    await userEvent.click(
      screen.getByRole("button", { name: "Save transaction" }),
    );
    await waitFor(() =>
      expect(api.recordStockMovement).toHaveBeenLastCalledWith({
        ingredientId: 21,
        type: "in",
        quantity: 10,
        remarks: "delivery",
      }),
    );

    await userEvent.selectOptions(screen.getByLabelText("Type"), "out");
    await userEvent.type(screen.getByLabelText("Quantity"), "5");
    await userEvent.type(screen.getByLabelText("Remarks"), "spoilage");
    await userEvent.click(
      screen.getByRole("button", { name: "Save transaction" }),
    );
    await waitFor(() =>
      expect(api.recordStockMovement).toHaveBeenLastCalledWith({
        ingredientId: 21,
        type: "out",
        quantity: 5,
        remarks: "spoilage",
      }),
    );
  });

  it("shows filtered stock history with transaction IDs and movement badges", async () => {
    api.listStockHistory.mockResolvedValue([
      {
        id: 8,
        ingredientId: 23,
        ingredientName: "Rice",
        type: "in",
        quantity: 22,
        remainingStock: 672,
        userId: 4,
        userName: "Juan Dela Cruz",
        dateTime: "2026-11-04T09:28:00Z",
        remarks: "Delivery",
      },
      {
        id: 7,
        ingredientId: 21,
        ingredientName: "Espresso Beans",
        type: "out",
        quantity: 5,
        remainingStock: 195,
        userId: 2,
        userName: "Eric Espedilion",
        dateTime: "2026-11-02T08:55:00Z",
        remarks: "Weekly usage",
      },
    ]);

    renderWithProviders(<InventoryPage />);
    await userEvent.click(await screen.findByRole("tab", { name: "Stock History" }));

    expect(await screen.findByRole("columnheader", { name: "Date & Time" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "ID" })).toBeInTheDocument();
    expect(await screen.findByText("IN")).toHaveClass("stock-history-type", "is-in");
    expect(screen.getByText("OUT")).toHaveClass("stock-history-type", "is-out");
    expect(screen.getByText("22 g")).toBeInTheDocument();
    expect(screen.getByText("Weekly usage")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Ingredient"), "23");
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-11-01" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-11-30" } });
    await waitFor(() =>
      expect(api.listStockHistory).toHaveBeenLastCalledWith({
        ingredientId: "23",
        from: "2026-11-01",
        to: "2026-11-30",
      }),
    );
  });
});
