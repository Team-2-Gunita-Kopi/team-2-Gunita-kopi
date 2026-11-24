import {
  CreateBaristaIngredientRequestSchema,
  IngredientSupplierOptionsSchema,
  IngredientSchema,
  StockTransactionSchema,
  pageOf,
  type CreateBaristaIngredientRequest,
  type Ingredient,
  type IngredientSupplierOption,
  type StockTransaction,
  type StockTransactionType,
} from "@/contracts";
import { apiAllPages, apiData } from "@/staff/lib/api-client";

/** FR-14/FR-19: inventory with the stock status computed by the database view. */
export function listIngredients(): Promise<Ingredient[]> {
  return apiAllPages("/api/ingredients", pageOf(IngredientSchema));
}

/** Existing active suppliers available for ingredient assignment; no supplier details or writes. */
export function listIngredientSupplierOptions(): Promise<
  IngredientSupplierOption[]
> {
  return apiData(
    "/api/ingredients/suppliers",
    IngredientSupplierOptionsSchema,
  );
}

/** Baristas may assign an existing supplier; supplier details, cost, and add-on fields are excluded. */
export function createBaristaIngredient(
  input: CreateBaristaIngredientRequest,
): Promise<Ingredient> {
  const body = CreateBaristaIngredientRequestSchema.parse(input);
  return apiData("/api/ingredients", IngredientSchema, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** FR-17: latest stock movements. */
export async function listStockHistory(filters: {
  ingredientId?: string;
  from?: string;
  to?: string;
} = {}): Promise<StockTransaction[]> {
  const query = new URLSearchParams({ pageSize: "50" });
  if (filters.ingredientId) query.set("ingredientId", filters.ingredientId);
  if (filters.from) query.set("from", filters.from);
  if (filters.to) query.set("to", filters.to);
  const page = await apiData(
    `/api/stock-transactions?${query}`,
    pageOf(StockTransactionSchema),
  );
  return page.items;
}

/** FR-15/FR-16: Baristas record manual stock-in or stock-out from the POS. */
export function recordStockMovement(input: {
  ingredientId: number;
  type: StockTransactionType;
  quantity: number;
  remarks?: string;
}): Promise<StockTransaction> {
  return apiData("/api/stock-transactions", StockTransactionSchema, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export const STOCK_BADGE: Record<Ingredient["stockStatus"], { status: string; label: string }> = {
  available: { status: "ok", label: "In Stock" },
  "low-stock": { status: "low_stock", label: "Low Stock" },
  "out-of-stock": { status: "out_of_stock", label: "Out of Stock" },
};
