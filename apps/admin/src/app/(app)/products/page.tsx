"use client";

import React from "react";
import Link from "next/link";
import { Button, DataTable } from "@gunita/ui";

interface SampleProductRow extends Record<string, unknown> {
  id: string;
  name: string;
  category: string;
  sellingPrice: string;
  costPrice: string;
  margin: string;
}

const sampleProducts: SampleProductRow[] = [
  {
    id: "prod-1",
    name: "Spanish Latte",
    category: "Coffee",
    sellingPrice: "₱140.00",
    costPrice: "₱42.50",
    margin: "69.6%",
  },
  {
    id: "prod-2",
    name: "Caramel Macchiato",
    category: "Coffee",
    sellingPrice: "₱150.00",
    costPrice: "₱48.20",
    margin: "67.8%",
  },
];

export default function ProductsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Products</h1>
          <p className="text-sm text-gray-500">Manage coffee menu and items</p>
        </div>
        <div className="flex items-center space-x-3">
          <Link href="/products/recipe-costing">
            <Button variant="outline">Recipe Costing</Button>
          </Link>
          <Button>Add Product</Button>
        </div>
      </div>

      <DataTable<SampleProductRow>
        columns={[
          { key: "name", header: "Product Name" },
          { key: "category", header: "Category" },
          { key: "sellingPrice", header: "Selling Price" },
          { key: "costPrice", header: "Cost (COGS)" },
          { key: "margin", header: "Profit Margin" },
        ]}
        data={sampleProducts}
        keyExtractor={(row) => row.id}
      />
    </div>
  );
}
