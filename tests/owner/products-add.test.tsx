import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { Product } from "@/contracts";
import { renderWithProviders } from "@/owner/test/render";

vi.mock("@/owner/lib/use-mocks", () => ({ USE_MOCKS: false }));

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => navigation,
}));

const productsApi = vi.hoisted(() => ({
  listProducts: vi.fn(),
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  uploadProductImage: vi.fn(),
  removeProductImage: vi.fn(),
}));
vi.mock("@/owner/features/products/api", () => productsApi);

import AddProductPage from "@/app/(owner)/admin/(app)/products/new/page";

const created: Product = {
  id: 77,
  name: "Ube Latte",
  description: null,
  category: "Iced Coffee",
  price: 150,
  isAvailable: true,
  image: null,
  createdBy: 1,
  createdAt: "2026-11-23T00:00:00Z",
};

// Figma "Owner Add Product": a full page with the same form as Edit, not a dialog.
describe("Owner Add Product page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    productsApi.listProducts.mockResolvedValue([{ ...created, id: 1, category: "Iced Coffee" }]);
    productsApi.createProduct.mockResolvedValue(created);
  });

  it("creates the product with the form values and returns to the list", async () => {
    renderWithProviders(<AddProductPage />);
    expect(screen.getByRole("heading", { name: "Add Product" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Available on POS" })).toBeChecked();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Ube Latte" } });
    await screen.findByRole("option", { name: "Iced Coffee" });
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "Iced Coffee" } });
    fireEvent.change(screen.getByLabelText("Price (₱)"), { target: { value: "150" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(productsApi.createProduct).toHaveBeenCalledWith({
        name: "Ube Latte",
        category: "Iced Coffee",
        price: 150,
        description: null,
        isAvailable: true,
      }),
    );
    expect(productsApi.updateProduct).not.toHaveBeenCalled();
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/admin/products"));
  });
});
