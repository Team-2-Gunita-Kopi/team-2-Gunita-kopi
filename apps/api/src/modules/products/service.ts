import type {
  CostingLine,
  CreateProductRequest,
  Page,
  Product,
  ProductCosting,
  ProductListQuery,
  Recipe,
  UpdatePackagingCostRequest,
  UpdateProductRequest,
  UpdateRecipeRequest,
} from "@gunita/contracts";
import type { Tables } from "@gunita/db-types";
import { AuthenticatedUser } from "@/lib/auth";
import { dbError, NotFoundError } from "@/lib/errors";
import { pageRange, toPage } from "@/lib/request";
import { auditAction } from "@/lib/audit";

const toProduct = (r: Tables<"products">): Product => ({
  id: r.product_id,
  name: r.product_name,
  description: r.description,
  category: r.category,
  price: r.price,
  isAvailable: r.is_available,
  image: r.image,
  createdBy: r.created_by,
  createdAt: r.date_created,
});

const toRow = (d: UpdateProductRequest) => ({
  product_name: d.name,
  description: d.description,
  category: d.category,
  price: d.price,
  is_available: d.isAvailable,
  image: d.image,
});

/** Both roles: baristas need the catalog for order entry (FR-05). */
export async function listProducts(
  user: AuthenticatedUser,
  q: ProductListQuery,
): Promise<Page<Product>> {
  let query = user.supabaseClient
    .from("products")
    .select("*", { count: "exact" })
    .order("category")
    .order("product_name")
    .range(...pageRange(q));
  if (q.category) query = query.eq("category", q.category);
  if (q.available) query = query.eq("is_available", q.available === "true");
  if (q.search) query = query.ilike("product_name", `%${q.search}%`);
  const { data, error, count } = await query;
  if (error) throw dbError(error);
  return toPage(data.map(toProduct), count, q);
}

export async function getProduct(
  user: AuthenticatedUser,
  id: number,
): Promise<Product> {
  const { data, error } = await user.supabaseClient
    .from("products")
    .select("*")
    .eq("product_id", id)
    .maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new NotFoundError("Product not found");
  return toProduct(data);
}

/** created_by is always the caller (FR-52). */
export async function createProduct(
  user: AuthenticatedUser,
  body: CreateProductRequest,
): Promise<Product> {
  const { data, error } = await user.supabaseClient
    .from("products")
    .insert({
      ...toRow(body),
      product_name: body.name,
      price: body.price,
      created_by: user.userId,
    })
    .select()
    .single();
  if (error) throw dbError(error);
  await auditAction(user, "product.create", "products", data.product_id, body);
  return toProduct(data);
}

/** Changing the price never touches saved orders: they keep their own unit_price. */
export async function updateProduct(
  user: AuthenticatedUser,
  id: number,
  body: UpdateProductRequest,
): Promise<Product> {
  const { data, error } = await user.supabaseClient
    .from("products")
    .update(toRow(body))
    .eq("product_id", id)
    .select()
    .maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new NotFoundError("Product not found");
  await auditAction(user, "product.update", "products", id, body);
  return toProduct(data);
}

// --- Recipe and costing (Owner only) -------------------------------------------

async function loadRecipeLines(user: AuthenticatedUser, productId: number) {
  const { data, error } = await user.supabaseClient
    .from("product_ingredients")
    .select(
      "quantity_needed, ingredients(ingredient_id, ingredient_name, unit, unit_cost)",
    )
    .eq("product_id", productId)
    .order("product_ingredient_id");
  if (error) throw dbError(error);
  return data.flatMap((r) =>
    r.ingredients
      ? [
          {
            ingredientId: r.ingredients.ingredient_id,
            ingredientName: r.ingredients.ingredient_name,
            unit: r.ingredients.unit,
            quantityNeeded: r.quantity_needed,
            unitCost: r.ingredients.unit_cost,
          },
        ]
      : [],
  );
}

export async function getRecipe(
  user: AuthenticatedUser,
  productId: number,
): Promise<Recipe> {
  await getProduct(user, productId);
  const lines = await loadRecipeLines(user, productId);
  return {
    productId,
    items: lines.map(({ unitCost: _unitCost, ...item }) => item),
  };
}

/** Atomic replace in the database; the costing row is recalculated by trigger. */
export async function updateRecipe(
  user: AuthenticatedUser,
  productId: number,
  body: UpdateRecipeRequest,
): Promise<Recipe> {
  const { error } = await user.supabaseClient.rpc("set_product_recipe", {
    p_product_id: productId,
    p_items: body.items.map((i) => ({
      ingredient_id: i.ingredientId,
      quantity_needed: i.quantityNeeded,
    })),
  });
  if (error) throw dbError(error);
  await auditAction(user, "product.recipe.update", "products", productId, body);
  return getRecipe(user, productId);
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Costing view (FR-27, FR-29). ingredientCost is the stored value the database keeps equal to
 * round(sum(quantity * unit cost), 2); line costs are the per-ingredient breakdown for display.
 */
export function computeCosting(
  product: { id: number; name: string; price: number },
  lines: Omit<CostingLine, "cost">[],
  stored: { ingredientCost: number; packagingCost: number },
): Omit<ProductCosting, "updatedAt"> {
  const costed = lines.map((l) => ({
    ...l,
    cost: round2(l.quantityNeeded * (l.unitCost ?? 0)),
  }));
  const { ingredientCost, packagingCost } = stored;
  const totalCost = round2(ingredientCost + packagingCost);
  const margin = round2(product.price - totalCost);
  return {
    productId: product.id,
    productName: product.name,
    sellingPrice: product.price,
    lines: costed,
    ingredientCost,
    packagingCost,
    totalCost,
    margin,
    marginPercent:
      product.price > 0 ? round2((margin / product.price) * 100) : null,
    missingUnitCost: costed
      .filter((l) => l.unitCost === null)
      .map((l) => l.ingredientId),
  };
}

export async function getCosting(
  user: AuthenticatedUser,
  productId: number,
): Promise<ProductCosting> {
  const product = await getProduct(user, productId);
  const [lines, stored] = await Promise.all([
    loadRecipeLines(user, productId),
    user.supabaseClient
      .from("product_costing")
      .select("ingredient_cost, packaging_cost, date_updated")
      .eq("product_id", productId)
      .maybeSingle(),
  ]);
  if (stored.error) throw dbError(stored.error);
  // No costing row yet means no recipe and no packaging cost: both are genuinely 0.
  return {
    ...computeCosting(product, lines, {
      ingredientCost: stored.data?.ingredient_cost ?? 0,
      packagingCost: stored.data?.packaging_cost ?? 0,
    }),
    updatedAt: stored.data?.date_updated ?? null,
  };
}

/** FR-26. ingredient_cost stays database-maintained; only packaging_cost is entered. */
export async function updatePackagingCost(
  user: AuthenticatedUser,
  productId: number,
  body: UpdatePackagingCostRequest,
): Promise<ProductCosting> {
  await getProduct(user, productId);
  const { error } = await user.supabaseClient
    .from("product_costing")
    .upsert(
      { product_id: productId, packaging_cost: body.packagingCost },
      { onConflict: "product_id" },
    );
  if (error) throw dbError(error);
  await auditAction(
    user,
    "product.costing.update",
    "products",
    productId,
    body,
  );
  return getCosting(user, productId);
}
