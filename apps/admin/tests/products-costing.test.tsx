import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { Product, ProductCosting } from "@gunita/contracts";
import { renderWithProviders } from "@/test/render";

// Real mode: Products page reads products and costing through two requests, not one per product.
vi.mock("@/lib/use-mocks", () => ({ USE_MOCKS: false }));

const client = vi.hoisted(() => ({
  apiData: vi.fn(),
  apiAllPages: vi.fn(),
}));
vi.mock("@/lib/api-client", () => client);

import ProductsPage from "@/app/(app)/products/page";

const product = (id: number, name: string, price: number): Product => ({
  id,
  name,
  description: null,
  category: "Iced Coffee",
  price,
  isAvailable: true,
  image: null,
  createdBy: null,
  createdAt: "2026-11-19T00:00:00Z",
});
const LATTE = product(1, "Latte", 120);
const SILOG = product(2, "Silog", 80);
const LATTE_COSTING: ProductCosting = {
  productId: 1,
  productName: "Latte",
  sellingPrice: 120,
  lines: [],
  ingredientCost: 18,
  packagingCost: 2,
  totalCost: 20,
  margin: 100,
  marginPercent: 83.33,
  missingUnitCost: [],
  updatedAt: null,
};

describe("Products page costing", () => {
  beforeEach(() => {
    client.apiData.mockReset();
    client.apiAllPages.mockReset();
    client.apiAllPages.mockResolvedValue([LATTE, SILOG]);
  });

  it("loads all costing with one request and shows cost and margin", async () => {
    client.apiData.mockResolvedValue([LATTE_COSTING]);
    renderWithProviders(<ProductsPage />);
    expect(await screen.findByText("83.3%")).toBeInTheDocument();
    expect(client.apiData).toHaveBeenCalledTimes(1);
    expect(client.apiData).toHaveBeenCalledWith(
      "/api/products/costing",
      expect.anything(),
    );
  });

  it("shows an error and leaves costs blank when costing cannot be read", async () => {
    client.apiData.mockRejectedValue(
      new Error("Service temporarily unavailable"),
    );
    renderWithProviders(<ProductsPage />);
    expect(
      await screen.findByText(/Costs and margins could not be loaded/),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Latte")).toBeInTheDocument());
    // No row claims a zero cost.
    expect(screen.queryByText("₱0.00")).not.toBeInTheDocument();
  });
});
