import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { Ingredient, Product, ProductCosting } from "@/contracts";
import { renderWithProviders } from "@/owner/test/render";

vi.mock("@/owner/lib/use-mocks", () => ({ USE_MOCKS: false }));

const api = vi.hoisted(() => ({
  listProductsWithCosting: vi.fn(),
  setRecipe: vi.fn(),
  setPackagingCost: vi.fn(),
  listIngredients: vi.fn(),
}));
vi.mock("@/owner/features/products/api", () => ({
  listProductsWithCosting: api.listProductsWithCosting,
  setRecipe: api.setRecipe,
  setPackagingCost: api.setPackagingCost,
}));
vi.mock("@/owner/features/inventory/api", () => ({
  listIngredients: api.listIngredients,
}));

import RecipeCostingPage from "@/app/(owner)/admin/(app)/products/recipe-costing/page";

const product: Product = {
  id: 1,
  name: "Iced Spanish Latte",
  description: null,
  category: "Iced Coffee",
  price: 145,
  isAvailable: true,
  image: null,
  createdBy: null,
  createdAt: "2026-11-19T00:00:00Z",
};

const lines: ProductCosting["lines"] = [
  {
    ingredientId: 11,
    ingredientName: "Coffee beans",
    unit: "g",
    quantityNeeded: 18,
    unitCost: 0.9,
    cost: 16.2,
  },
  {
    ingredientId: 12,
    ingredientName: "Fresh milk",
    unit: "mL",
    quantityNeeded: 150,
    unitCost: 0.09,
    cost: 13.5,
  },
  {
    ingredientId: 13,
    ingredientName: "Condensed milk",
    unit: "mL",
    quantityNeeded: 15,
    unitCost: 0.12,
    cost: 1.8,
  },
  {
    ingredientId: 14,
    ingredientName: "16oz iced cups",
    unit: "pcs",
    quantityNeeded: 1,
    unitCost: 6,
    cost: 6,
  },
  {
    ingredientId: 15,
    ingredientName: "Cup lids",
    unit: "pcs",
    quantityNeeded: 1,
    unitCost: 2,
    cost: 2,
  },
  {
    ingredientId: 16,
    ingredientName: "Straws",
    unit: "pcs",
    quantityNeeded: 1,
    unitCost: 0.5,
    cost: 0.5,
  },
];

const costing: ProductCosting = {
  productId: product.id,
  productName: product.name,
  sellingPrice: product.price,
  lines,
  ingredientCost: 40,
  packagingCost: 8,
  totalCost: 48,
  margin: 97,
  marginPercent: 66.9,
  missingUnitCost: [],
  updatedAt: null,
};

const ingredients: Ingredient[] = lines.map((line) => ({
  id: line.ingredientId,
  name: line.ingredientName,
  unit: line.unit,
  currentStock: 100,
  reorderLevel: 0,
  unitCost: line.unitCost,
  stockStatus: "available",
  supplierId: null,
  supplierName: null,
  updatedAt: "2026-11-19T00:00:00Z",
  isAddon: false,
  addonSellingPrice: null,
  addonQuantity: null,
}));

describe("Recipe & Costing page", () => {
  beforeEach(() => {
    api.listProductsWithCosting.mockReset().mockResolvedValue({
      items: [{ product, costing }],
      costingError: null,
    });
    api.listIngredients.mockReset().mockResolvedValue(ingredients);
    api.setRecipe.mockReset().mockResolvedValue(undefined);
    api.setPackagingCost.mockReset().mockResolvedValue(costing);
  });

  it("calculates ingredient cost, total cost, price, and margin from recipe inputs", async () => {
    renderWithProviders(<RecipeCostingPage />);

    expect(await screen.findByText("₱16.20")).toBeInTheDocument();
    expect(screen.getByText("₱40.00")).toBeInTheDocument();
    expect(screen.getByText("₱48.00")).toBeInTheDocument();
    expect(screen.getByText("₱145.00")).toBeInTheDocument();
    expect(screen.getByText("₱97.00 · 67%")).toBeInTheDocument();

    fireEvent.change(
      screen.getByLabelText("Quantity needed for Coffee beans"),
      {
        target: { value: "20" },
      },
    );
    expect(screen.getByText("₱18.00")).toBeInTheDocument();
    expect(screen.getByText("₱41.80")).toBeInTheDocument();
    expect(screen.getByText("₱49.80")).toBeInTheDocument();
    expect(screen.getByText("₱95.20 · 66%")).toBeInTheDocument();
  });

  it("rounds the ingredient total after summing raw line costs", async () => {
    const roundingLines: ProductCosting["lines"] = [
      {
        ingredientId: 21,
        ingredientName: "Small item A",
        unit: "g",
        quantityNeeded: 0.1,
        unitCost: 0.05,
        cost: 0.01,
      },
      {
        ingredientId: 22,
        ingredientName: "Small item B",
        unit: "g",
        quantityNeeded: 0.1,
        unitCost: 0.05,
        cost: 0.01,
      },
    ];
    api.listProductsWithCosting.mockResolvedValue({
      items: [
        {
          product,
          costing: {
            ...costing,
            lines: roundingLines,
            ingredientCost: 0.01,
            packagingCost: 0,
            totalCost: 0.01,
            margin: 144.99,
            marginPercent: 99.99,
          },
        },
      ],
      costingError: null,
    });
    api.listIngredients.mockResolvedValue(
      roundingLines.map((line) => ({
        ...ingredients[0]!,
        id: line.ingredientId,
        name: line.ingredientName,
        unitCost: line.unitCost,
      })),
    );
    renderWithProviders(<RecipeCostingPage />);

    await screen.findByLabelText("Quantity needed for Small item A");
    const ingredientCostRow = screen.getByText("Ingredient cost").parentElement;
    expect(ingredientCostRow).not.toBeNull();
    expect(within(ingredientCostRow!).getByText("₱0.01")).toBeInTheDocument();
  });

  it("saves the full recipe and changed packaging cost", async () => {
    const user = userEvent.setup();
    renderWithProviders(<RecipeCostingPage />);
    await screen.findByText("₱16.20");

    fireEvent.change(
      screen.getByLabelText("Quantity needed for Coffee beans"),
      {
        target: { value: "20" },
      },
    );
    fireEvent.change(screen.getByLabelText("Packaging cost (₱)"), {
      target: { value: "9" },
    });
    await user.click(screen.getByRole("button", { name: "Save recipe" }));

    await waitFor(() => {
      expect(api.setRecipe).toHaveBeenCalledWith(
        1,
        lines.map((line) => ({
          ingredientId: line.ingredientId,
          quantityNeeded: line.ingredientId === 11 ? 20 : line.quantityNeeded,
        })),
      );
      expect(api.setPackagingCost).toHaveBeenCalledWith(1, 9);
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Recipe saved.",
    );
  });

  it("requires an ingredient before saving a newly added row", async () => {
    const user = userEvent.setup();
    renderWithProviders(<RecipeCostingPage />);
    await screen.findByText("₱16.20");

    await user.click(screen.getByRole("button", { name: "Add ingredient" }));
    fireEvent.change(screen.getByLabelText("Quantity needed for row 7"), {
      target: { value: "1" },
    });
    await user.click(screen.getByRole("button", { name: "Save recipe" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Choose an ingredient for row 7.",
    );
    expect(api.setRecipe).not.toHaveBeenCalled();
  });
});
