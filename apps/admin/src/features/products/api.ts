import {
  ProductCostingSchema,
  ProductSchema,
  RecipeSchema,
  pageOf,
  productImageSrc,
  type CreateProductRequest,
  type Product,
  type ProductCosting,
  type UpdateProductRequest,
} from "@gunita/contracts";
import { formatPeso } from "@gunita/ui";
import { apiAllPages, apiData } from "@/lib/api-client";

// FR-05, FR-50 to FR-52: menu management.
export const listProducts = (): Promise<Product[]> =>
  apiAllPages("/api/products", pageOf(ProductSchema));

export const createProduct = (body: CreateProductRequest): Promise<Product> =>
  apiData("/api/products", ProductSchema, { method: "POST", body: JSON.stringify(body) });

export const updateProduct = (id: number, body: UpdateProductRequest): Promise<Product> =>
  apiData(`/api/products/${id}`, ProductSchema, { method: "PATCH", body: JSON.stringify(body) });

// FR-50 product image: stored privately by the API (PNG, JPEG or WebP, 2 MB at most).
export const uploadProductImage = (id: number, file: File): Promise<Product> =>
  apiData(`/api/products/${id}/image`, ProductSchema, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });

export const removeProductImage = (id: number): Promise<Product> =>
  apiData(`/api/products/${id}/image`, ProductSchema, { method: "DELETE" });

// FR-23 to FR-29: recipe and costing. The database derives ingredient_cost and total_cost.
export const getCosting = (id: number): Promise<ProductCosting> =>
  apiData(`/api/products/${id}/costing`, ProductCostingSchema);

export const setPackagingCost = (id: number, packagingCost: number): Promise<ProductCosting> =>
  apiData(`/api/products/${id}/costing`, ProductCostingSchema, {
    method: "PUT",
    body: JSON.stringify({ packagingCost }),
  });

export const getRecipe = (id: number) => apiData(`/api/products/${id}/recipe`, RecipeSchema);

export const setRecipe = (id: number, items: { ingredientId: number; quantityNeeded: number }[]) =>
  apiData(`/api/products/${id}/recipe`, RecipeSchema, {
    method: "PUT",
    body: JSON.stringify({ items }),
  });

export const listCostings = (): Promise<ProductCosting[]> =>
  apiData("/api/products/costing", ProductCostingSchema.array());

export interface ProductsWithCosting {
  items: { product: Product; costing: ProductCosting | null }[];
  /** Set when costing could not be read: products still show, costs stay blank, never 0. */
  costingError: string | null;
}

/** Every product with its costing: two requests in total (products, then one costing list). */
export async function listProductsWithCosting(): Promise<ProductsWithCosting> {
  const [products, costings] = await Promise.all([
    listProducts(),
    listCostings().then(
      (list) => ({ list, error: null }),
      (e: unknown) => ({
        list: [] as ProductCosting[],
        error: e instanceof Error ? e.message : "Could not load costing.",
      }),
    ),
  ]);
  const byId = new Map(costings.list.map((c) => [c.productId, c]));
  return {
    items: products.map((product) => ({ product, costing: byId.get(product.id) ?? null })),
    costingError: costings.error,
  };
}

export interface ProductRow extends Record<string, unknown> {
  id: string;
  name: string;
  category: string;
  sellingPrice: string;
  costPrice: string;
  margin: string;
  available: boolean;
  imageSrc?: string;
}

export function toProductRow(p: Product, c: ProductCosting | null): ProductRow {
  return {
    id: String(p.id),
    imageSrc: productImageSrc(p),
    name: p.name,
    category: p.category ?? "",
    sellingPrice: formatPeso(p.price),
    costPrice: c ? formatPeso(c.totalCost) : "",
    margin: c?.marginPercent === null || !c ? "" : `${c.marginPercent.toFixed(1)}%`,
    available: p.isAvailable,
  };
}
