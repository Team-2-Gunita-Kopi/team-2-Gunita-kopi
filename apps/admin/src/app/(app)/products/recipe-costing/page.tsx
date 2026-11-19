"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, DataTable, Dialog, Input, Select, formatPeso } from "@gunita/ui";
import type { ProductCosting } from "@gunita/contracts";
import { USE_MOCKS } from "@/lib/use-mocks";
import {
  getRecipe,
  listProductsWithCosting,
  setPackagingCost,
  setRecipe,
} from "@/features/products/api";
import { listIngredients } from "@/features/inventory/api";

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

type Line = { ingredientId: string; quantityNeeded: string };

const toRow = (c: ProductCosting): CostingRow => ({
  id: String(c.productId),
  product: c.productName,
  ingredientCount: c.lines.length,
  totalCost: formatPeso(c.totalCost),
  retailPrice: formatPeso(c.sellingPrice),
  profitMargin: c.marginPercent === null ? "" : `${c.marginPercent.toFixed(1)}%`,
});

export default function RecipeCostingPage() {
  const client = useQueryClient();
  const costings = useQuery({ queryKey: ["products"], enabled: !USE_MOCKS, queryFn: listProductsWithCosting });
  const ingredients = useQuery({ queryKey: ["ingredients"], enabled: !USE_MOCKS, queryFn: listIngredients });
  const [editing, setEditing] = useState<ProductCosting | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [packaging, setPackaging] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const byId = new Map(
    (costings.data?.items ?? []).flatMap((r) => (r.costing ? [[String(r.product.id), r.costing] as const] : [])),
  );
  const rows = USE_MOCKS ? sampleCostings : [...byId.values()].map(toRow);

  const open = async (c: ProductCosting) => {
    setErrorMessage("");
    setEditing(c);
    setPackaging(String(c.packagingCost));
    const recipe = await getRecipe(c.productId).catch(() => null);
    setLines(
      (recipe?.items ?? []).map((i) => ({ ingredientId: String(i.ingredientId), quantityNeeded: String(i.quantityNeeded) })),
    );
  };

  // FR-23 to FR-28: the recipe is replaced atomically (set_product_recipe) and the database
  // recalculates ingredient_cost; only the packaging cost is entered here.
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setErrorMessage("");
    try {
      await setRecipe(
        editing.productId,
        lines
          .filter((l) => l.ingredientId)
          .map((l) => ({ ingredientId: Number(l.ingredientId), quantityNeeded: Number(l.quantityNeeded) })),
      );
      if (Number(packaging) !== editing.packagingCost) {
        await setPackagingCost(editing.productId, Number(packaging));
      }
      setEditing(null);
      await client.invalidateQueries({ queryKey: ["products"] });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Could not save the recipe.");
    }
  };

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

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
        {/* Costs are kept current by the database; this only reloads them. */}
        <Button onClick={() => void costings.refetch()} disabled={USE_MOCKS}>
          Recalculate All Margins
        </Button>
      </div>

      {costings.error && (
        <p className="text-sm text-red-700">
          {costings.error instanceof Error ? costings.error.message : "Could not load costing."}
        </p>
      )}
      {costings.data?.costingError && (
        <p className="text-sm text-red-700">Could not load costing: {costings.data.costingError}</p>
      )}

      <DataTable<CostingRow>
        columns={[
          { key: "product", header: "Product" },
          { key: "ingredientCount", header: "Ingredients" },
          { key: "totalCost", header: "Computed Cost (COGS)" },
          { key: "retailPrice", header: "Retail Price" },
          { key: "profitMargin", header: "Gross Margin" },
          {
            key: "actions",
            header: "",
            render: (row) => (
              <Button
                size="sm"
                variant="outline"
                disabled={USE_MOCKS}
                onClick={() => {
                  const c = byId.get(row.id);
                  if (c) void open(c);
                }}
              >
                Edit Recipe
              </Button>
            ),
          },
        ]}
        data={rows}
        keyExtractor={(row) => row.id}
      />

      <Dialog isOpen={editing !== null} onClose={() => setEditing(null)} title={`Recipe: ${editing?.productName ?? ""}`} wide>
        <form onSubmit={save} className="space-y-4">
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
              {errorMessage}
            </div>
          )}
          {lines.map((l, i) => (
            <div key={i} className="flex items-end gap-2">
              <Select
                label="Ingredient"
                value={l.ingredientId}
                onChange={(e) => setLine(i, { ingredientId: e.target.value })}
                options={[
                  { value: "", label: "Select an ingredient" },
                  ...(ingredients.data ?? []).map((ing) => ({
                    value: String(ing.id),
                    label: `${ing.name}${ing.unit ? ` (${ing.unit})` : ""}`,
                  })),
                ]}
              />
              <Input
                label="Quantity per unit"
                type="number"
                min="0.01"
                step="0.01"
                required
                value={l.quantityNeeded}
                onChange={(e) => setLine(i, { quantityNeeded: e.target.value })}
              />
              <Button type="button" variant="ghost" onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                Remove
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() => setLines([...lines, { ingredientId: "", quantityNeeded: "" }])}
          >
            Add Ingredient
          </Button>
          <Input
            label="Packaging Cost"
            type="number"
            min="0"
            step="0.01"
            required
            value={packaging}
            onChange={(e) => setPackaging(e.target.value)}
          />
          {editing && editing.missingUnitCost.length > 0 && (
            <p className="text-xs text-amber-700">
              Some ingredients have no unit cost yet and count as 0 in the ingredient cost.
            </p>
          )}
          <div className="flex justify-end space-x-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
