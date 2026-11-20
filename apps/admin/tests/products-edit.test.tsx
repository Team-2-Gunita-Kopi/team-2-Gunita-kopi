import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { Product } from "@gunita/contracts";
import { renderWithProviders } from "@/test/render";

vi.mock("@/lib/use-mocks", () => ({ USE_MOCKS: false }));

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useParams: () => ({ id: "1" }),
  useRouter: () => navigation,
}));

const productsApi = vi.hoisted(() => ({
  getProduct: vi.fn(),
  listProducts: vi.fn(),
  updateProduct: vi.fn(),
  uploadProductImage: vi.fn(),
  removeProductImage: vi.fn(),
}));
vi.mock("@/features/products/api", () => productsApi);

import EditProductPage from "@/app/(app)/products/[id]/edit/page";

const product: Product = {
  id: 1,
  name: "Iced Spanish Latte",
  description: "Condensed-milk classic",
  category: "Iced Coffee",
  price: 145,
  isAvailable: true,
  image: null,
  createdBy: null,
  createdAt: "2026-11-19T00:00:00Z",
};

describe("Owner product edit page", () => {
  beforeEach(() => {
    navigation.push.mockReset();
    productsApi.getProduct.mockReset().mockResolvedValue(product);
    productsApi.listProducts
      .mockReset()
      .mockResolvedValue([
        product,
        { ...product, id: 2, category: "Non-Coffee" },
      ]);
    productsApi.updateProduct
      .mockReset()
      .mockImplementation(async (_id: number, patch: Partial<Product>) => ({
        ...product,
        ...patch,
      }));
    productsApi.uploadProductImage.mockReset();
    productsApi.removeProductImage.mockReset();
  });

  it("loads the product fields and saves edits including POS availability", async () => {
    renderWithProviders(<EditProductPage />);

    expect(
      await screen.findByRole("heading", {
        name: "Edit — Iced Spanish Latte",
      }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("Iced Spanish Latte");
    expect(screen.getByLabelText("Category")).toHaveValue("Iced Coffee");
    expect(screen.getByLabelText("Price (₱)")).toHaveValue(145);
    expect(screen.getByLabelText("Description")).toHaveValue(
      "Condensed-milk classic",
    );

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Ube Latte" },
    });
    fireEvent.change(screen.getByLabelText("Category"), {
      target: { value: "Non-Coffee" },
    });
    fireEvent.change(screen.getByLabelText("Price (₱)"), {
      target: { value: "155" },
    });
    fireEvent.click(screen.getByRole("switch", { name: "Available on POS" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(productsApi.updateProduct).toHaveBeenCalledWith(1, {
        name: "Ube Latte",
        category: "Non-Coffee",
        price: 155,
        description: "Condensed-milk classic",
        isAvailable: false,
      });
    });
    expect(navigation.push).toHaveBeenCalledWith("/products");
  });

  it("shows a save error and stays on the form when the API rejects the update", async () => {
    productsApi.updateProduct.mockRejectedValue(new Error("Update denied"));
    renderWithProviders(<EditProductPage />);
    await screen.findByRole("heading", {
      name: "Edit — Iced Spanish Latte",
    });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Update denied");
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("uploads a selected image after saving product fields", async () => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:product-preview"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    const image = new File(["image"], "latte.png", { type: "image/png" });
    productsApi.uploadProductImage.mockResolvedValue({
      ...product,
      image: "1/123e4567-e89b-12d3-a456-426614174000.png",
    });
    renderWithProviders(<EditProductPage />);
    await screen.findByRole("heading", {
      name: "Edit — Iced Spanish Latte",
    });

    fireEvent.change(screen.getByLabelText("Product image"), {
      target: { files: [image] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(productsApi.uploadProductImage).toHaveBeenCalledWith(1, image);
    });
    expect(navigation.push).toHaveBeenCalledWith("/products");
  });
});
