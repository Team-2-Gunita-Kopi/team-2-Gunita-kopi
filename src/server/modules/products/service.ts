import type {
  DeleteProductResponse,
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
} from "@/contracts";
import {
  isStoredProductImage,
  PRODUCT_IMAGE_BUCKET,
  PRODUCT_IMAGE_MAX_BYTES,
} from "@/contracts";
import type { Tables } from "@/db-types";
import { randomUUID } from "node:crypto";
import { AuthenticatedUser } from "@/server/lib/auth";
import { AppError, dbError, ForbiddenError, NotFoundError } from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";
import { escapeLike, pageRange, toPage } from "@/server/lib/request";
import { auditAction } from "@/server/lib/audit";
import { ownerUnitCosts } from "@/server/modules/ingredients/service";

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

/**
 * Both roles: baristas need the catalog for order entry (FR-05). Each product carries its recipe
 * lines so the POS can mark it out of stock; checkout still rechecks stock in the database.
 */
export async function listProducts(
  user: AuthenticatedUser,
  q: ProductListQuery,
): Promise<Page<Product>> {
  let query = user.supabaseClient
    .from("products")
    .select("*, product_ingredients(ingredient_id, quantity_needed)", { count: "exact" })
    .is("deleted_at", null)
    .order("category")
    .order("product_name")
    .range(...pageRange(q));
  if (q.category) query = query.eq("category", q.category);
  if (q.available) query = query.eq("is_available", q.available === "true");
  if (q.search) query = query.ilike("product_name", `%${escapeLike(q.search)}%`);
  const { data, error, count } = await query;
  if (error) throw dbError(error);
  return toPage(
    data.map(({ product_ingredients, ...row }) => ({
      ...toProduct(row),
      recipe: (product_ingredients ?? []).map((l) => ({
        ingredientId: l.ingredient_id,
        quantityNeeded: l.quantity_needed,
      })),
    })),
    count,
    q,
  );
}

export async function getProduct(
  user: AuthenticatedUser,
  id: number,
): Promise<Product> {
  const { data, error } = await user.supabaseClient
    .from("products")
    .select("*")
    .eq("product_id", id)
    .is("deleted_at", null)
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
    .is("deleted_at", null)
    .select()
    .maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new NotFoundError("Product not found");
  await auditAction(user, "product.update", "products", id, body);
  return toProduct(data);
}

/**
 * Owner soft delete: the row stays for orders, reports and costing history, but every product read
 * leaves it out. It is also made unavailable, so an order queued offline with it is a conflict.
 */
export async function deleteProduct(
  user: AuthenticatedUser,
  id: number,
): Promise<DeleteProductResponse> {
  const { data, error } = await user.supabaseClient
    .from("products")
    .update({ deleted_at: new Date().toISOString(), is_available: false })
    .eq("product_id", id)
    .is("deleted_at", null)
    .select("product_id")
    .maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new NotFoundError("Product not found");
  await auditAction(user, "product.delete", "products", id, {});
  return { id };
}

// --- Product image (FR-50; SDS 2.6/2.8: private Supabase Storage, authorized access) -----

const IMAGE_EXT = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
} as const;
type ImageType = keyof typeof IMAGE_EXT;

const startsWith = (b: Uint8Array, at: number, sig: number[]) =>
  b.length >= at + sig.length && sig.every((v, i) => b[at + i] === v);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** Type from the file's first bytes; the client's Content-Type and file name are not trusted. */
export function sniffImageType(b: Uint8Array): ImageType | null {
  if (startsWith(b, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return "image/png";
  if (startsWith(b, 0, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(b, 0, ascii("RIFF")) && startsWith(b, 8, ascii("WEBP")))
    return "image/webp";
  return null;
}

const imageTooLarge = () =>
  new AppError("The image must be 2 MB or smaller", 413, "IMAGE_TOO_LARGE");

/** Rejects early on a declared size over the limit, before the body is read. */
export function assertImageLength(contentLength: string | null): void {
  if (contentLength && Number(contentLength) > PRODUCT_IMAGE_MAX_BYTES)
    throw imageTooLarge();
}

function storageError(error: {
  message: string;
  statusCode?: string | number;
}): AppError {
  if (Number(error.statusCode) === 403) {
    return new ForbiddenError("Not allowed by the storage access rules");
  }
  if (Number(error.statusCode) === 404)
    return new NotFoundError("Image not found");
  return new AppError(error.message, 500, "STORAGE_ERROR");
}

const images = (user: AuthenticatedUser) =>
  user.supabaseClient.storage.from(PRODUCT_IMAGE_BUCKET);

/** Best effort: a leftover file is harmless (private, unreferenced); log it for cleanup. */
async function removeStoredImage(user: AuthenticatedUser, path: string) {
  const { error } = await images(user).remove([path]);
  if (error)
    logger.warn("products.image_remove_failed", { path, error: error.message });
}

/**
 * Stores a new image under a server-generated path ("<id>/<uuid>.<ext>"; no client file name is
 * used) with the caller's token, so Storage RLS allows it for the Owner only, then points
 * products.image at it and removes the previous stored file.
 */
export async function setProductImage(
  user: AuthenticatedUser,
  id: number,
  bytes: Uint8Array,
): Promise<Product> {
  if (bytes.length > PRODUCT_IMAGE_MAX_BYTES) throw imageTooLarge();
  const type = sniffImageType(bytes);
  if (!type) {
    throw new AppError(
      "Upload a PNG, JPEG or WebP image",
      415,
      "UNSUPPORTED_IMAGE",
    );
  }
  const previous = (await getProduct(user, id)).image;
  const path = `${id}/${randomUUID()}.${IMAGE_EXT[type]}`;
  const { error } = await images(user).upload(path, bytes, {
    contentType: type,
    upsert: false,
  });
  if (error) throw storageError(error);

  let product: Product;
  try {
    product = await updateProduct(user, id, { image: path });
  } catch (err) {
    await removeStoredImage(user, path);
    throw err;
  }
  if (isStoredProductImage(id, previous))
    await removeStoredImage(user, previous);
  return product;
}

/** Clears products.image; a stored file is deleted too. Older URL values are just cleared. */
export async function removeProductImage(
  user: AuthenticatedUser,
  id: number,
): Promise<Product> {
  const previous = (await getProduct(user, id)).image;
  const product = await updateProduct(user, id, { image: null });
  if (isStoredProductImage(id, previous))
    await removeStoredImage(user, previous);
  return product;
}

/** Reads a stored image with the caller's token (Storage RLS: both roles may read). */
export async function getProductImage(
  user: AuthenticatedUser,
  id: number,
): Promise<Blob> {
  const { image } = await getProduct(user, id);
  if (!isStoredProductImage(id, image))
    throw new NotFoundError("Product has no stored image");
  const { data, error } = await images(user).download(image);
  if (error) throw storageError(error);
  const ext = image.slice(image.lastIndexOf(".") + 1);
  const type = Object.entries(IMAGE_EXT).find(([, e]) => e === ext)![0];
  return new Blob([await data.arrayBuffer()], { type });
}

// --- Recipe and costing (Owner only) -------------------------------------------

async function loadRecipeLines(user: AuthenticatedUser, productId: number) {
  const { data, error } = await user.supabaseClient
    .from("product_ingredients")
    .select(
      "quantity_needed, ingredients(ingredient_id, ingredient_name, unit)",
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
  return { productId, items: lines };
}

/** Atomic replace in the database; the costing row is recalculated by trigger. */
export async function updateRecipe(
  user: AuthenticatedUser,
  productId: number,
  body: UpdateRecipeRequest,
): Promise<Recipe> {
  await getProduct(user, productId); // 404 for a deleted product (stale Recipe & Costing screen)
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
  const [recipe, costs, stored] = await Promise.all([
    loadRecipeLines(user, productId),
    ownerUnitCosts(user),
    user.supabaseClient
      .from("product_costing")
      .select("ingredient_cost, packaging_cost, date_updated")
      .eq("product_id", productId)
      .maybeSingle(),
  ]);
  if (stored.error) throw dbError(stored.error);
  // Only the Owner reaches this (route); unit costs come from ingredient_unit_costs().
  const lines = recipe.map((l) => ({
    ...l,
    unitCost: costs?.get(l.ingredientId) ?? null,
  }));
  // No costing row yet means no recipe and no packaging cost: both are genuinely 0.
  return {
    ...computeCosting(product, lines, {
      ingredientCost: stored.data?.ingredient_cost ?? 0,
      packagingCost: stored.data?.packaging_cost ?? 0,
    }),
    updatedAt: stored.data?.date_updated ?? null,
  };
}

/**
 * Costing of every product in 4 queries (Products page), instead of one request per product.
 * Owner only (route); unit costs come from ingredient_unit_costs(), like getCosting.
 * shortcut: one PostgREST read per table (max_rows, 1000 by default), page the reads if recipes outgrow it.
 */
export async function listCostings(
  user: AuthenticatedUser,
): Promise<ProductCosting[]> {
  const [products, recipes, costs, stored] = await Promise.all([
    user.supabaseClient
      .from("products")
      .select("product_id, product_name, price")
      .is("deleted_at", null)
      .order("product_id"),
    user.supabaseClient
      .from("product_ingredients")
      .select(
        "product_id, quantity_needed, ingredients(ingredient_id, ingredient_name, unit)",
      )
      .order("product_ingredient_id"),
    ownerUnitCosts(user),
    user.supabaseClient
      .from("product_costing")
      .select("product_id, ingredient_cost, packaging_cost, date_updated"),
  ]);
  for (const r of [products, recipes, stored])
    if (r.error) throw dbError(r.error);

  const linesBy = new Map<number, Omit<CostingLine, "cost">[]>();
  for (const r of recipes.data ?? []) {
    if (!r.ingredients) continue;
    const lines = linesBy.get(r.product_id) ?? [];
    lines.push({
      ingredientId: r.ingredients.ingredient_id,
      ingredientName: r.ingredients.ingredient_name,
      unit: r.ingredients.unit,
      quantityNeeded: r.quantity_needed,
      unitCost: costs?.get(r.ingredients.ingredient_id) ?? null,
    });
    linesBy.set(r.product_id, lines);
  }
  const storedBy = new Map((stored.data ?? []).map((s) => [s.product_id, s]));

  return (products.data ?? []).map((p) => {
    const s = storedBy.get(p.product_id);
    return {
      ...computeCosting(
        { id: p.product_id, name: p.product_name, price: p.price },
        linesBy.get(p.product_id) ?? [],
        {
          ingredientCost: s?.ingredient_cost ?? 0,
          packagingCost: s?.packaging_cost ?? 0,
        },
      ),
      updatedAt: s?.date_updated ?? null,
    };
  });
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
