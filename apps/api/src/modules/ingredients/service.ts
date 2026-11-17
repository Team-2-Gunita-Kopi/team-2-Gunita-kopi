import type {
  CreateIngredientRequest,
  Ingredient,
  IngredientListQuery,
  Page,
  StockStatus,
  UpdateIngredientRequest,
} from "@gunita/contracts";
import type { Tables } from "@gunita/db-types";
import { AuthenticatedUser } from "@/lib/auth";
import { dbError, NotFoundError } from "@/lib/errors";
import { pageRange, toPage } from "@/lib/request";
import { auditAction } from "@/lib/audit";

// Read through v_inventory_status so stock status has one definition (the view, FR-19).
const toIngredient = (r: Tables<"v_inventory_status">): Ingredient => ({
  id: r.ingredient_id,
  name: r.ingredient_name,
  unit: r.unit,
  currentStock: r.current_stock,
  reorderLevel: r.reorder_level,
  unitCost: r.unit_cost,
  stockStatus: r.stock_status as StockStatus,
  supplierId: r.supplier_id,
  supplierName: r.supplier_name,
  updatedAt: r.date_updated,
});

const toRow = (d: UpdateIngredientRequest) => ({
  ingredient_name: d.name,
  unit: d.unit,
  supplier_id: d.supplierId,
  reorder_level: d.reorderLevel,
  unit_cost: d.unitCost,
});

/** Both roles (FR-14). Filter stockStatus=low-stock,out-of-stock for alerts. */
export async function listIngredients(
  user: AuthenticatedUser,
  q: IngredientListQuery,
): Promise<Page<Ingredient>> {
  let query = user.supabaseClient
    .from("v_inventory_status")
    .select("*", { count: "exact" })
    .order("ingredient_name")
    .range(...pageRange(q));
  if (q.stockStatus) query = query.in("stock_status", q.stockStatus);
  if (q.supplierId) query = query.eq("supplier_id", q.supplierId);
  if (q.search) query = query.ilike("ingredient_name", `%${q.search}%`);
  const { data, error, count } = await query;
  if (error) throw dbError(error);
  return toPage(data.map(toIngredient), count, q);
}

export async function getIngredient(
  user: AuthenticatedUser,
  id: number,
): Promise<Ingredient> {
  const { data, error } = await user.supabaseClient
    .from("v_inventory_status")
    .select("*")
    .eq("ingredient_id", id)
    .maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new NotFoundError("Ingredient not found");
  return toIngredient(data);
}

/** Starts at 0 stock; the opening quantity is a stock-in, so it appears in the history (FR-17). */
export async function createIngredient(
  user: AuthenticatedUser,
  body: CreateIngredientRequest,
): Promise<Ingredient> {
  const { data, error } = await user.supabaseClient
    .from("ingredients")
    .insert({ ...toRow(body), ingredient_name: body.name })
    .select("ingredient_id")
    .single();
  if (error) throw dbError(error);
  await auditAction(
    user,
    "ingredient.create",
    "ingredients",
    data.ingredient_id,
    body,
  );
  return getIngredient(user, data.ingredient_id);
}

/** A unit_cost change recosts every product that uses the ingredient (database trigger). */
export async function updateIngredient(
  user: AuthenticatedUser,
  id: number,
  body: UpdateIngredientRequest,
): Promise<Ingredient> {
  const { data, error } = await user.supabaseClient
    .from("ingredients")
    .update(toRow(body))
    .eq("ingredient_id", id)
    .select("ingredient_id")
    .maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new NotFoundError("Ingredient not found");
  await auditAction(user, "ingredient.update", "ingredients", id, body);
  return getIngredient(user, id);
}
