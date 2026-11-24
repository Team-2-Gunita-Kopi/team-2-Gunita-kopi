import { z } from "zod";
import {
  DeleteIngredientResponseSchema,
  IngredientProductSchema,
  IngredientSchema,
  StockTransactionSchema,
  pageOf,
  type CreateIngredientRequest,
  type DeleteIngredientResponse,
  type Ingredient,
  type IngredientProduct,
  type StockTransaction,
  type StockTransactionType,
  type UpdateIngredientRequest,
} from "@/contracts";
import { apiAllPages, apiData } from "@/owner/lib/api-client";

// FR-14 to FR-21: inventory. Stock changes only through stock transactions (FR-17).
export const listIngredients = (): Promise<Ingredient[]> =>
  apiAllPages("/api/ingredients", pageOf(IngredientSchema));

export const createIngredient = (body: CreateIngredientRequest): Promise<Ingredient> =>
  apiData("/api/ingredients", IngredientSchema, { method: "POST", body: JSON.stringify(body) });

export const updateIngredient = (id: number, body: UpdateIngredientRequest): Promise<Ingredient> =>
  apiData(`/api/ingredients/${id}`, IngredientSchema, { method: "PATCH", body: JSON.stringify(body) });

/** R11: products whose recipe uses the ingredient, shown before deleting it. */
export const listIngredientProducts = (id: number): Promise<IngredientProduct[]> =>
  apiData(`/api/ingredients/${id}/products`, z.array(IngredientProductSchema));

/** Soft delete: hidden everywhere and taken out of recipes; history keeps its name. */
export const deleteIngredient = (id: number): Promise<DeleteIngredientResponse> =>
  apiData(`/api/ingredients/${id}`, DeleteIngredientResponseSchema, { method: "DELETE" });

export async function listStockHistory(filters: {
  ingredientId?: string;
  from?: string;
  to?: string;
} = {}): Promise<StockTransaction[]> {
  const query = new URLSearchParams({ pageSize: "100" });
  if (filters.ingredientId) query.set("ingredientId", filters.ingredientId);
  if (filters.from) query.set("from", filters.from);
  if (filters.to) query.set("to", filters.to);
  const page = await apiData(
    `/api/stock-transactions?${query}`,
    pageOf(StockTransactionSchema),
  );
  return page.items;
}

/**
 * FR-15: stock-in (deliveries, replenishment). The API and RLS allow the Owner or Barista to record
 * either movement type; the Barista records from the POS.
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

export const recordStockMovement = (input: {
  ingredientId: number;
  type: StockTransactionType;
  quantity: number;
  remarks?: string;
}): Promise<StockTransaction> =>
  apiData("/api/stock-transactions", StockTransactionSchema, {
    method: "POST",
    body: JSON.stringify(input),
  });

export const STOCK_BADGE: Record<Ingredient["stockStatus"], { status: string; label: string }> = {
  available: { status: "ok", label: "In Stock" },
  "low-stock": { status: "low_stock", label: "Low Stock" },
  "out-of-stock": { status: "out_of_stock", label: "Out of Stock" },
};
