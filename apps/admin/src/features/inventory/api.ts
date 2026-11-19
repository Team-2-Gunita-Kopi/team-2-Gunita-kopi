import {
  IngredientSchema,
  StockTransactionSchema,
  pageOf,
  type CreateIngredientRequest,
  type Ingredient,
  type StockTransaction,
  type UpdateIngredientRequest,
} from "@gunita/contracts";
import { apiAllPages, apiData } from "@/lib/api-client";

// FR-14 to FR-21: inventory. Stock changes only through stock transactions (FR-17).
export const listIngredients = (): Promise<Ingredient[]> =>
  apiAllPages("/api/ingredients", pageOf(IngredientSchema));

export const createIngredient = (body: CreateIngredientRequest): Promise<Ingredient> =>
  apiData("/api/ingredients", IngredientSchema, { method: "POST", body: JSON.stringify(body) });

export const updateIngredient = (id: number, body: UpdateIngredientRequest): Promise<Ingredient> =>
  apiData(`/api/ingredients/${id}`, IngredientSchema, { method: "PATCH", body: JSON.stringify(body) });

export async function listStockHistory(): Promise<StockTransaction[]> {
  const page = await apiData("/api/stock-transactions?pageSize=100", pageOf(StockTransactionSchema));
  return page.items;
}

/**
 * FR-15: stock-in (deliveries, replenishment). The API applies SRS 2.3 strictly: the Owner records
 * stock-in, Barista/Service Staff record stock-out on the POS (403 otherwise).
 */
export const recordStockIn = (input: {
  ingredientId: number;
  quantity: number;
  remarks?: string;
}): Promise<StockTransaction> =>
  apiData("/api/stock-transactions", StockTransactionSchema, {
    method: "POST",
    body: JSON.stringify({ ...input, type: "in" }),
  });

export const STOCK_BADGE: Record<Ingredient["stockStatus"], { status: string; label: string }> = {
  available: { status: "completed", label: "Adequate" },
  "low-stock": { status: "low_stock", label: "Low Stock" },
  "out-of-stock": { status: "out_of_stock", label: "Out of Stock" },
};
