import {
  ADDON_SELLING_PRICE,
  type CreateIngredientRequest,
  type Ingredient,
  type IngredientListQuery,
  type Page,
  type StockStatus,
  type UpdateIngredientRequest,
} from "@gunita/contracts";
import type { Tables } from "@gunita/db-types";
import { AuthenticatedUser } from "@/lib/auth";
import { dbError, NotFoundError } from "@/lib/errors";
import { pageRange, toPage } from "@/lib/request";
import { auditAction } from "@/lib/audit";

type UnitCosts = Map<number, number | null>;

// Read through v_inventory_status so stock status has one definition (the view, FR-19).
// unitCost is added for the Owner only; Barista responses do not contain the key.
const toIngredient = (
  r: Tables<"v_inventory_status">,
  costs?: UnitCosts,
): Ingredient => ({
  id: r.ingredient_id,
  name: r.ingredient_name,
  unit: r.unit,
  currentStock: r.current_stock,
  reorderLevel: r.reorder_level,
  ...(costs ? { unitCost: costs.get(r.ingredient_id) ?? null } : {}),
  stockStatus: r.stock_status as StockStatus,
  supplierId: r.supplier_id,
  supplierName: r.supplier_name,
  updatedAt: r.date_updated,
  isAddon: r.is_addon,
  addonSellingPrice: r.addon_selling_price,
  addonQuantity: r.addon_quantity,
});

/**
 * Ingredient costs are Owner-only (team decision). The database refuses unit_cost to every signed-in
 * role and serves it to the Owner through ingredient_unit_costs(); a Barista gets no cost lookup.
 */
export async function ownerUnitCosts(
  user: AuthenticatedUser,
): Promise<UnitCosts | undefined> {
  if (user.role !== "owner_admin") return undefined;
  const { data, error } = await user.supabaseClient.rpc(
    "ingredient_unit_costs",
  );
  if (error) throw dbError(error);
  return new Map(data.map((c) => [c.ingredient_id, c.unit_cost ?? null]));
}

// The add-on price is never taken from the client: it is the fixed price or NULL.
const toRow = (d: UpdateIngredientRequest) => ({
  ingredient_name: d.name,
  unit: d.unit,
  supplier_id: d.supplierId,
  reorder_level: d.reorderLevel,
  unit_cost: d.unitCost,
  ...(d.isAddon === undefined
    ? {}
    : {
        is_addon: d.isAddon,
        addon_selling_price: d.isAddon ? ADDON_SELLING_PRICE : null,
        addon_quantity: d.isAddon ? d.addonQuantity : null,
      }),
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
  const [{ data, error, count }, costs] = await Promise.all([
    query,
    ownerUnitCosts(user),
  ]);
  if (error) throw dbError(error);
  return toPage(
    data.map((r) => toIngredient(r, costs)),
    count,
    q,
  );
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
  return toIngredient(data, await ownerUnitCosts(user));
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

/**
 * A unit_cost change recosts every product that uses the ingredient (database trigger). Add-on
 * changes apply to later sales only: saved orders and stock history are never recalculated.
 */
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
