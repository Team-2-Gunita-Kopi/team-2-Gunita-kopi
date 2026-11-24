import { z } from "zod";
import {
  IdSchema,
  MoneySchema,
  NonNegativeQuantitySchema,
  PaginationQuerySchema,
  QuantitySchema,
  optionalText,
  MAX_STATUS_FILTERS,
  patchOf,
} from "./common";

/** FR-19. Derived from current_stock and reorder_level by the v_inventory_status view. */
export const StockStatusSchema = z.enum([
  "available",
  "low-stock",
  "out-of-stock",
]);
export type StockStatus = z.infer<typeof StockStatusSchema>;

/**
 * Confirmed client decision: every POS add-on sells for PHP 25.00. The database enforces the same
 * value (ingredients_addon_config_check); clients never send a price for the configuration.
 */
export const ADDON_SELLING_PRICE = 25;

// INGREDIENTS (FR-21). An ingredient may also be a POS add-on (is_addon): one selection sells for
// addonSellingPrice and uses addonQuantity of the ingredient's own unit.
export const IngredientSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  unit: z.string().nullable(),
  currentStock: z.number(),
  reorderLevel: z.number(),
  /** Owner only (null when not entered). Barista responses never contain this key. */
  unitCost: z.number().nullable().optional(),
  stockStatus: StockStatusSchema,
  /** Owner only; null for Baristas. */
  supplierId: z.number().int().nullable(),
  /** Owner only; null for Baristas. */
  supplierName: z.string().nullable(),
  updatedAt: z.string(),
  isAddon: z.boolean(),
  /** ADDON_SELLING_PRICE when isAddon, else null. */
  addonSellingPrice: z.number().nullable(),
  /** Amount used per add-on selection, in `unit`; null when not an add-on. */
  addonQuantity: z.number().nullable(),
});
export type Ingredient = z.infer<typeof IngredientSchema>;

/** An add-on needs a quantity per selection; a regular ingredient has none. */
const addonRule = (
  v: { isAddon?: boolean; addonQuantity?: number | null },
  ctx: z.RefinementCtx,
) => {
  if (v.isAddon && v.addonQuantity == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["addonQuantity"],
      message: "Enter the quantity used per add-on selection",
    });
  } else if (!v.isAddon && v.addonQuantity != null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["addonQuantity"],
      message: "Only a POS add-on has a quantity per selection",
    });
  }
};

/**
 * New ingredients start at 0 stock: every stock change must be a stock transaction (FR-17),
 * so the opening quantity is recorded with a stock-in.
 */
const IngredientFieldsSchema = z.object({
  name: z.string().trim().min(1, "Ingredient name is required").max(100),
  unit: optionalText(20),
  supplierId: IdSchema.nullable().optional(),
  reorderLevel: NonNegativeQuantitySchema.default(0),
  unitCost: MoneySchema.nullable().optional(),
  /** Available as a POS add-on. The selling price is always ADDON_SELLING_PRICE. */
  isAddon: z.boolean().default(false),
  /** Required (> 0) when isAddon; must be empty otherwise. */
  addonQuantity: QuantitySchema.nullable().optional(),
});

export const CreateIngredientRequestSchema =
  IngredientFieldsSchema.superRefine(addonRule);
export type CreateIngredientRequest = z.infer<
  typeof CreateIngredientRequestSchema
>;

/** Baristas may link an existing supplier but cannot set supplier details, cost, or add-on fields. */
export const CreateBaristaIngredientRequestSchema = z
  .object({
    name: z.string().trim().min(1, "Ingredient name is required").max(100),
    unit: optionalText(20).default(null),
    supplierId: IdSchema.nullable().default(null),
    reorderLevel: NonNegativeQuantitySchema.default(0),
    openingStock: NonNegativeQuantitySchema.default(0),
  })
  .strict();
export type CreateBaristaIngredientRequest = z.infer<
  typeof CreateBaristaIngredientRequestSchema
>;

/** Partial update. current_stock is not here: it changes only through stock transactions. */
export const UpdateIngredientRequestSchema = patchOf(IngredientFieldsSchema)
  .extend({ reorderLevel: NonNegativeQuantitySchema.optional() })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update")
  .superRefine(addonRule);
export type UpdateIngredientRequest = z.infer<
  typeof UpdateIngredientRequestSchema
>;

export const IngredientListQuerySchema = PaginationQuerySchema.extend({
  /** One status or a comma list, e.g. "low-stock,out-of-stock". */
  stockStatus: z
    .string()
    .transform((v) => v.split(","))
    .pipe(z.array(StockStatusSchema).min(1).max(MAX_STATUS_FILTERS))
    .optional(),
  supplierId: IdSchema.optional(),
  search: z.string().trim().min(1).max(100).optional(),
});
export type IngredientListQuery = z.infer<typeof IngredientListQuerySchema>;
