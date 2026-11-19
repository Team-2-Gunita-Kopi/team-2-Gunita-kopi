import {
  IngredientSchema,
  StockTransactionSchema,
  pageOf,
  type Ingredient,
  type StockTransaction,
} from "@gunita/contracts";
import { apiAllPages, apiData } from "@/lib/api-client";

/** FR-14/FR-19: inventory with the stock status computed by the database view. */
export function listIngredients(): Promise<Ingredient[]> {
  return apiAllPages("/api/ingredients", pageOf(IngredientSchema));
}

/** FR-17: latest stock movements. */
export async function listStockHistory(): Promise<StockTransaction[]> {
  const page = await apiData("/api/stock-transactions?pageSize=50", pageOf(StockTransactionSchema));
  return page.items;
}

/**
 * FR-16: manual stock-out (used, spoiled or wasted). Baristas may only record stock-out
 * (SRS FR-15/FR-16); the API and RLS refuse stock-in from this role.
 */
export function recordStockOut(input: {
  ingredientId: number;
  quantity: number;
  remarks?: string;
}): Promise<StockTransaction> {
  return apiData("/api/stock-transactions", StockTransactionSchema, {
    method: "POST",
    body: JSON.stringify({ ...input, type: "out" }),
  });
}

export const STOCK_BADGE: Record<Ingredient["stockStatus"], { status: string; label: string }> = {
  available: { status: "completed", label: "In Stock" },
  "low-stock": { status: "low_stock", label: "Low Stock" },
  "out-of-stock": { status: "out_of_stock", label: "Out of Stock" },
};
