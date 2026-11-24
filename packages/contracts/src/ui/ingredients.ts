import { z } from "zod";

export const IngredientSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  sku: z.string().optional(),
  unit: z.string(),
  currentStock: z.number().nonnegative(),
  minimumStock: z.number().nonnegative(),
  unitCost: z.number().nonnegative(),
  supplierId: z.string().optional(),
  supplierName: z.string().optional(),
  isLowStock: z.boolean().default(false),
  updatedAt: z.string(),
});
export type Ingredient = z.infer<typeof IngredientSchema>;

export const CreateIngredientRequestSchema = z.object({
  name: z.string().min(1),
  sku: z.string().optional(),
  unit: z.string().min(1),
  currentStock: z.number().nonnegative().default(0),
  minimumStock: z.number().nonnegative().default(0),
  unitCost: z.number().nonnegative(),
  supplierId: z.string().optional(),
});
export type CreateIngredientRequest = z.infer<
  typeof CreateIngredientRequestSchema
>;
