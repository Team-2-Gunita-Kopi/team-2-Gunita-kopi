import { IngredientSchema } from "./ingredients";
import { ProductSchema } from "./products";
import type { z } from "zod";

export const PosProductSchema = ProductSchema.omit({
  costPrice: true,
  profitMarginPercent: true,
});
export type PosProduct = z.infer<typeof PosProductSchema>;

export const PosIngredientSchema = IngredientSchema.omit({
  unitCost: true,
  supplierId: true,
  supplierName: true,
});
export type PosIngredient = z.infer<typeof PosIngredientSchema>;
