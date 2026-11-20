import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { Ingredient, StockTransaction } from "@gunita/contracts";
import { renderWithProviders } from "@/test/render";

vi.mock("@/lib/use-mocks", () => ({ USE_MOCKS: false }));

const api = vi.hoisted(() => ({
  listIngredients: vi.fn(),
  listIngredientSupplierOptions: vi.fn(),
  createBaristaIngredient: vi.fn(),
  listStockHistory: vi.fn<
    (filters?: { ingredientId?: string; from?: string; to?: string }) => Promise<StockTransaction[]>
  >(async () => []),
  recordStockMovement: vi.fn(),
}));
vi.mock("@/features/inventory/api", async (importActual) => ({
  ...(await importActual<typeof import("@/features/inventory/api")>()),
  ...api,
}));

import PosInventoryPage from "@/app/(pos)/inventory/page";

const base = {
  currentStock: 200,
  reorderLevel: 20,
  stockStatus: "available" as const,
  supplierId: null,
  supplierName: null,
  updatedAt: "2026-11-19T00:00:00Z",
  isAddon: false,
  addonSellingPrice: null,
  addonQuantity: null,
};
const BEANS: Ingredient = {
  ...base,
  id: 21,
  name: "Espresso Beans",
  unit: "g",
  unitCost: 1.2,
};
const RICE: Ingredient = {
  ...base,
  id: 23,
  name: "Rice",
  unit: "g",
  unitCost: 0.05,
};

beforeEach(() => {
  vi.clearAllMocks();
  api.listIngredients.mockResolvedValue([BEANS, RICE]);
  api.listIngredientSupplierOptions.mockResolvedValue([
    { id: 6, name: "Batangas Barako Traders" },
  ]);
  api.createBaristaIngredient.mockResolvedValue({});
  api.recordStockMovement.mockResolvedValue({});
});

describe("POS inventory", () => {
  it("assigns an existing supplier without exposing unit cost or supplier creation", async () => {
    renderWithProviders(<PosInventoryPage />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Add ingredient" }),
    );

    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Unit")).toHaveValue("g");
    expect(screen.getByLabelText("Supplier")).toHaveValue("");
    await screen.findByRole("option", { name: "Batangas Barako Traders" });
    await userEvent.selectOptions(
      screen.getByLabelText("Supplier"),
      "6",
    );
    expect(screen.queryByLabelText("Unit Cost")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Choose an existing supplier only. New suppliers and unit costs are managed by the Owner.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /add supplier/i }),
    ).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Name"), "Sugar");
    await userEvent.clear(screen.getByLabelText("Reorder level"));
    await userEvent.type(screen.getByLabelText("Reorder level"), "25");
    await userEvent.clear(screen.getByLabelText("Opening stock"));
    await userEvent.type(screen.getByLabelText("Opening stock"), "500");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(api.createBaristaIngredient).toHaveBeenCalledWith({
        name: "Sugar",
        unit: "g",
        supplierId: 6,
        reorderLevel: 25,
        openingStock: 500,
      }),
    );
    expect(await screen.findByText("Ingredient added.")).toBeInTheDocument();
  });

  it("shows a cost-free ingredient list and opens stock-out for the selected ingredient", async () => {
    renderWithProviders(<PosInventoryPage />);
    expect(await screen.findByRole("columnheader", { name: "Reorder At" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Unit Cost" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Supplier" })).not.toBeInTheDocument();

    const row = (await screen.findByText("Rice")).closest("tr")!;
    expect(within(row).getByText("23")).toBeInTheDocument();
    await userEvent.click(within(row).getByRole("button", { name: "Stock In/Out" }));

    expect(screen.getByLabelText("Ingredient")).toHaveValue("23");
    expect(screen.getByLabelText("Type")).toHaveValue("out");
    expect(screen.getByLabelText("Type")).not.toBeDisabled();

    await userEvent.type(screen.getByLabelText("Quantity"), "10");
    await userEvent.type(screen.getByLabelText("Remarks"), "Waste");
    await userEvent.click(screen.getByRole("button", { name: "Save transaction" }));
    await waitFor(() =>
      expect(api.recordStockMovement).toHaveBeenLastCalledWith({
        ingredientId: 23,
        type: "out",
        quantity: 10,
        remarks: "Waste",
      }),
    );

    await userEvent.selectOptions(screen.getByLabelText("Type"), "in");
    await userEvent.type(screen.getByLabelText("Quantity"), "30");
    await userEvent.type(screen.getByLabelText("Remarks"), "Delivery");
    await userEvent.click(screen.getByRole("button", { name: "Save transaction" }));
    await waitFor(() =>
      expect(api.recordStockMovement).toHaveBeenLastCalledWith({
        ingredientId: 23,
        type: "in",
        quantity: 30,
        remarks: "Delivery",
      }),
    );
  });

  it("opens ingredient-filtered history and applies date filters", async () => {
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
    ]);

    renderWithProviders(<PosInventoryPage />);
    const row = (await screen.findByText("Rice")).closest("tr")!;
    await userEvent.click(within(row).getByRole("button", { name: "History" }));

    expect(await screen.findByRole("columnheader", { name: "Date & Time" })).toBeInTheDocument();
    expect(screen.getByLabelText("Ingredient")).toHaveValue("23");
    expect(await screen.findByText("22 g")).toBeInTheDocument();
    expect(screen.getByText("IN")).toHaveClass("stock-history-type", "is-in");
    await waitFor(() =>
      expect(api.listStockHistory).toHaveBeenLastCalledWith({
        ingredientId: "23",
        from: "",
        to: "",
      }),
    );

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
