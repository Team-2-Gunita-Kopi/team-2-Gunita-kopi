import { z } from "zod";
import {
  IdSchema,
  MoneySchema,
  NonNegativeQuantitySchema,
  PaginationQuerySchema,
  optionalText,
} from "./common";

/** FR-19. Derived from current_stock and reorder_level by the v_inventory_status view. */
export const StockStatusSchema = z.enum([
  "available",
  "low-stock",
  "out-of-stock",
]);
export type StockStatus = z.infer<typeof StockStatusSchema>;

// INGREDIENTS (FR-21). Also the add-on items: unit_cost is the add-on price basis (SDS 3.5.3).
export const IngredientSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  unit: z.string().nullable(),
  currentStock: z.number(),
  reorderLevel: z.number(),
  unitCost: z.number().nullable(),
  stockStatus: StockStatusSchema,
  supplierId: z.number().int().nullable(),
  /** Null for baristas: supplier records are Owner-only. */
  supplierName: z.string().nullable(),
  updatedAt: z.string(),
});
export type Ingredient = z.infer<typeof IngredientSchema>;

/**
 * New ingredients start at 0 stock: every stock change must be a stock transaction (FR-17),
 * so the opening quantity is recorded with a stock-in.
 */
export const CreateIngredientRequestSchema = z.object({
  name: z.string().trim().min(1, "Ingredient name is required").max(100),
  unit: optionalText(20),
  supplierId: IdSchema.nullable().optional(),
  reorderLevel: NonNegativeQuantitySchema.default(0),
  unitCost: MoneySchema.nullable().optional(),
});
export type CreateIngredientRequest = z.infer<
  typeof CreateIngredientRequestSchema
>;

/** Partial update. current_stock is not here: it changes only through stock transactions. */
export const UpdateIngredientRequestSchema =
  CreateIngredientRequestSchema.partial()
    .extend({ reorderLevel: NonNegativeQuantitySchema.optional() })
    .refine((v) => Object.keys(v).length > 0, "Nothing to update");
export type UpdateIngredientRequest = z.infer<
  typeof UpdateIngredientRequestSchema
>;

export const IngredientListQuerySchema = PaginationQuerySchema.extend({
  /** One status or a comma list, e.g. "low-stock,out-of-stock". */
  stockStatus: z
    .string()
    .transform((v) => v.split(","))
    .pipe(z.array(StockStatusSchema).min(1))
    .optional(),
  supplierId: IdSchema.optional(),
  search: z.string().trim().min(1).max(100).optional(),
});
export type IngredientListQuery = z.infer<typeof IngredientListQuerySchema>;
