import { IngredientSchema } from "./ingredients";
import { ProductSchema } from "./products";
import { z } from "zod";

export const PosProductSchema = ProductSchema.omit({
  costPrice: true,
  profitMarginPercent: true,
});
export type PosProduct = z.infer<typeof PosProductSchema>;

export const PosIngredientSchema = IngredientSchema.omit({
  unitCost: true,
  supplierId: true,
  supplierName: true,
}).extend({
  /** Set only for a complete POS add-on configuration: price per selection, amount used per selection. */
  addon: z
    .object({
      price: z.number().nonnegative(),
      quantity: z.number().positive(),
    })
    .optional(),
});
export type PosIngredient = z.infer<typeof PosIngredientSchema>;
