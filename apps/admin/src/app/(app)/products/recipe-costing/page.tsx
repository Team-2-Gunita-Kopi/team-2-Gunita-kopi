"use client";

import React from "react";
import Link from "next/link";
import { Button, DataTable } from "@gunita/ui";

interface CostingRow extends Record<string, unknown> {
  id: string;
  product: string;
  ingredientCount: number;
  totalCost: string;
  retailPrice: string;
  profitMargin: string;
}

const sampleCostings: CostingRow[] = [
  {
    id: "rc-1",
    product: "Spanish Latte (16oz)",
    ingredientCount: 4,
    totalCost: "₱42.50",
    retailPrice: "₱140.00",
    profitMargin: "69.6%",
  },
  {
    id: "rc-2",
    product: "Americano (16oz)",
    ingredientCount: 2,
    totalCost: "₱18.00",
    retailPrice: "₱100.00",
    profitMargin: "82.0%",
  },
];

export default function RecipeCostingPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-2 text-xs text-gray-400 mb-1">
            <Link href="/products" className="hover:text-emerald-700">
              Products
            </Link>
            <span>/</span>
            <span>Recipe Costing</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            Recipe Costing & Profit Margins
          </h1>
          <p className="text-sm text-gray-500">
            Automated COGS and margin calculation based on ingredient costs
          </p>
        </div>
        <Button>Recalculate All Margins</Button>
      </div>

      <DataTable<CostingRow>
        columns={[
          { key: "product", header: "Product" },
          { key: "ingredientCount", header: "Ingredients" },
          { key: "totalCost", header: "Computed Cost (COGS)" },
          { key: "retailPrice", header: "Retail Price" },
          { key: "profitMargin", header: "Gross Margin" },
        ]}
        data={sampleCostings}
        keyExtractor={(row) => row.id}
      />
    </div>
  );
}
