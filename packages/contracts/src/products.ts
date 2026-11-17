import { z } from "zod";
import {
  IdSchema,
  MoneySchema,
  PaginationQuerySchema,
  QuantitySchema,
  optionalText,
} from "./common";

export const ProductSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  description: z.string().nullable(),
  category: z.string().nullable(),
  price: z.number(),
  isAvailable: z.boolean(),
  /** Image file reference (Supabase Storage path or URL). */
  image: z.string().nullable(),
  createdBy: z.number().int().nullable(),
  createdAt: z.string(),
});
export type Product = z.infer<typeof ProductSchema>;

export const CreateProductRequestSchema = z.object({
  name: z.string().trim().min(1, "Product name is required").max(100),
  description: optionalText(5000),
  category: optionalText(50),
  price: MoneySchema,
  isAvailable: z.boolean().default(true),
  image: optionalText(255),
});
export type CreateProductRequest = z.infer<typeof CreateProductRequestSchema>;

/** Partial update; send only the fields to change. { isAvailable } alone sets availability (FR-51). */
export const UpdateProductRequestSchema = CreateProductRequestSchema.partial()
  .extend({ isAvailable: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");
export type UpdateProductRequest = z.infer<typeof UpdateProductRequestSchema>;

export const ProductListQuerySchema = PaginationQuerySchema.extend({
  category: z.string().trim().min(1).optional(),
  available: z.enum(["true", "false"]).optional(),
  search: z.string().trim().min(1).max(100).optional(),
});
export type ProductListQuery = z.infer<typeof ProductListQuerySchema>;

// --- Recipe (PRODUCT_INGREDIENTS, FR-23) ------------------------------------

export const RecipeItemSchema = z.object({
  ingredientId: z.number().int(),
  ingredientName: z.string(),
  unit: z.string().nullable(),
  quantityNeeded: z.number(),
});
export type RecipeItem = z.infer<typeof RecipeItemSchema>;

export const RecipeSchema = z.object({
  productId: z.number().int(),
  items: z.array(RecipeItemSchema),
});
export type Recipe = z.infer<typeof RecipeSchema>;

/** Replaces the whole recipe: listed ingredients are added or updated, the rest are removed. */
export const UpdateRecipeRequestSchema = z.object({
  items: z
    .array(
      z.object({
        ingredientId: IdSchema,
        quantityNeeded: QuantitySchema,
      }),
    )
    .max(50)
    .refine(
      (items) =>
        new Set(items.map((i) => i.ingredientId)).size === items.length,
      "Each ingredient may appear once per recipe",
    ),
});
export type UpdateRecipeRequest = z.infer<typeof UpdateRecipeRequestSchema>;

// --- Costing (PRODUCT_COSTING, FR-24 to FR-29) --------------------------------

export const CostingLineSchema = RecipeItemSchema.extend({
  /** ingredients.unit_cost; null when the Owner has not entered it (counted as 0). */
  unitCost: z.number().nullable(),
  cost: z.number(),
});
export type CostingLine = z.infer<typeof CostingLineSchema>;

export const ProductCostingSchema = z.object({
  productId: z.number().int(),
  productName: z.string(),
  sellingPrice: z.number(),
  lines: z.array(CostingLineSchema),
  ingredientCost: z.number(),
  packagingCost: z.number(),
  totalCost: z.number(),
  /** sellingPrice - totalCost. */
  margin: z.number(),
  /** margin / sellingPrice * 100; null when the price is 0. */
  marginPercent: z.number().nullable(),
  /** Ingredients in the recipe with no unit cost yet. */
  missingUnitCost: z.array(z.number().int()),
  updatedAt: z.string().nullable(),
});
export type ProductCosting = z.infer<typeof ProductCostingSchema>;

export const UpdatePackagingCostRequestSchema = z.object({
  packagingCost: MoneySchema,
});
export type UpdatePackagingCostRequest = z.infer<
  typeof UpdatePackagingCostRequestSchema
>;
