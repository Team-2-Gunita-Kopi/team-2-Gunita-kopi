"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Button, Tabs } from "@gunita/ui";
import { USE_MOCKS } from "@/lib/use-mocks";
import { getProduct, listProducts } from "@/features/products/api";
import { ProductForm } from "@/features/products/ProductForm";

const PRODUCT_TABS = [
  { id: "list", label: "Product List", href: "/products" },
  {
    id: "costing",
    label: "Recipe & Costing",
    href: "/products/recipe-costing",
  },
];

export default function EditProductPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const productId = Number(id);
  const validId = Number.isSafeInteger(productId) && productId > 0;
  const product = useQuery({
    queryKey: ["product", productId],
    enabled: !USE_MOCKS && validId,
    queryFn: () => getProduct(productId),
  });
  const productList = useQuery({
    queryKey: ["product-edit-categories"],
    enabled: !USE_MOCKS,
    queryFn: listProducts,
  });

  if (USE_MOCKS) {
    return (
      <div className="product-edit-page">
        <p className="muted" role="status">
          Product editing is available when the Admin app is connected to the
          API.
        </p>
        <Button variant="outline" onClick={() => router.push("/products")}>
          Cancel
        </Button>
      </div>
    );
  }
  if (!validId) {
    return (
      <p role="alert" className="recipe-message error">
        Invalid product id.
      </p>
    );
  }
  if (product.isPending) return <p role="status">Loading product…</p>;
  if (product.error || !product.data) {
    return (
      <div className="product-edit-page">
        <p role="alert" className="recipe-message error">
          {product.error instanceof Error
            ? product.error.message
            : "Product not found."}
        </p>
        <Button variant="outline" onClick={() => router.push("/products")}>
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
        <h1>Edit — {product.data.name}</h1>
      </header>
      <Tabs tabs={PRODUCT_TABS} activeTab="list" className="product-tabs" />
      {productList.error ? (
        <p role="alert" className="recipe-message error">
          Product categories could not be loaded. The current category remains
          available.
        </p>
      ) : null}
      <ProductForm
        key={product.data.id}
        product={product.data}
        categories={categories}
      />
    </div>
  );
}
