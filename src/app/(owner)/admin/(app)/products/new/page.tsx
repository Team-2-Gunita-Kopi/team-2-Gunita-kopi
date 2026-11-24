"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Button, Tabs } from "@/ui";
import { USE_MOCKS } from "@/owner/lib/use-mocks";
import { listProducts } from "@/owner/features/products/api";
import { ProductForm } from "@/owner/features/products/ProductForm";

const PRODUCT_TABS = [
  { id: "list", label: "Product List", href: "/admin/products" },
  {
    id: "costing",
    label: "Recipe & Costing",
    href: "/admin/products/recipe-costing",
  },
];

// Figma "Gunita Kopi — Owner Add Product" (approved by jhnjffryyy 2026-11-23): same form as Edit.
export default function AddProductPage() {
  const router = useRouter();
  const productList = useQuery({
    queryKey: ["product-edit-categories"],
    enabled: !USE_MOCKS,
    queryFn: listProducts,
  });

  if (USE_MOCKS) {
    return (
      <div className="product-edit-page">
        <p className="muted" role="status">
          Adding products is available when the Admin app is connected to the
          API.
        </p>
        <Button variant="outline" onClick={() => router.push("/admin/products")}>
          Cancel
        </Button>
      </div>
    );
  }

  const categories = [
    ...new Set((productList.data ?? []).map((item) => item.category ?? "")),
  ].filter(Boolean);

  return (
    <div className="product-edit-page">
      <header>
        <p className="product-page-kicker">Gunita · Admin</p>
        <h1>Add Product</h1>
      </header>
      <Tabs tabs={PRODUCT_TABS} activeTab="list" className="product-tabs" />
      {productList.error ? (
        <p role="alert" className="recipe-message error">
          Product categories could not be loaded.
        </p>
      ) : null}
      <ProductForm categories={categories} />
    </div>
  );
}
