import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { Product, ProductCosting } from "@/contracts";
import { renderWithProviders } from "@/owner/test/render";

// Real mode: Products page reads products and costing through two requests, not one per product.
vi.mock("@/owner/lib/use-mocks", () => ({ USE_MOCKS: false }));

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => navigation,
}));

const client = vi.hoisted(() => ({
  apiData: vi.fn(),
  apiAllPages: vi.fn(),
}));
vi.mock("@/owner/lib/api-client", () => client);

import ProductsPage from "@/app/(owner)/admin/(app)/products/page";

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
const SILOG = { ...product(2, "Silog", 80), category: "Silog Meals" };
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
    navigation.push.mockReset();
    client.apiData.mockReset();
    client.apiAllPages.mockReset();
    client.apiAllPages.mockImplementation((endpoint: string) =>
      Promise.resolve(endpoint === "/api/users" ? [] : [LATTE, SILOG]),
    );
  });

  it("loads all costing with one request and shows cost and margin", async () => {
    client.apiData.mockResolvedValue([LATTE_COSTING]);
    renderWithProviders(<ProductsPage />);
    expect(await screen.findByText("83%")).toBeInTheDocument();
    expect(client.apiData).toHaveBeenCalledTimes(1);
    expect(client.apiData).toHaveBeenCalledWith(
      "/api/products/costing",
      expect.anything(),
    );
  });

  it("shows product metadata and filters by name and category", async () => {
    client.apiData.mockResolvedValue([LATTE_COSTING]);
    renderWithProviders(<ProductsPage />);

    expect(await screen.findByText("Latte")).toBeInTheDocument();
    const table = screen.getByRole("table");
    for (const header of [
      "ID",
      "Name",
      "Category",
      "Price",
      "Cost",
      "Margin",
      "Available",
      "Date Created",
      "Created By",
      "Actions",
    ]) {
      expect(
        within(table).getByRole("columnheader", { name: header }),
      ).toBeInTheDocument();
    }

    fireEvent.change(screen.getByPlaceholderText("Product name"), {
      target: { value: "Latte" },
    });
    await waitFor(() => {
      expect(within(table).getAllByRole("row")).toHaveLength(2);
    });
    expect(within(table).getByText("Nov 19, 2026")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Product name"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("Category"), {
      target: { value: "Silog Meals" },
    });
    await waitFor(() => {
      expect(within(table).getAllByRole("row")).toHaveLength(2);
    });
    expect(within(table).getByText("Silog")).toBeInTheDocument();
    expect(within(table).queryByText("Latte")).not.toBeInTheDocument();
  });

  it("updates product availability from the switch", async () => {
    client.apiData.mockResolvedValue([LATTE_COSTING]);
    renderWithProviders(<ProductsPage />);

    fireEvent.click(
      await screen.findByRole("switch", { name: "Available for Latte" }),
    );
    await waitFor(() => {
      expect(client.apiData).toHaveBeenCalledWith(
        "/api/products/1",
        expect.anything(),
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ isAvailable: false }),
        }),
      );
    });
  });

  it("opens the full-page editor from the product row", async () => {
    client.apiData.mockResolvedValue([LATTE_COSTING]);
    renderWithProviders(<ProductsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Edit Latte" }));

    expect(navigation.push).toHaveBeenCalledWith("/admin/products/1/edit");
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
