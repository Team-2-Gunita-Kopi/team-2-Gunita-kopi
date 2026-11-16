import { z } from "zod";

export const RecipeIngredientSchema = z.object({
  ingredientId: z.string(),
  ingredientName: z.string().optional(),
  quantity: z.number().positive(),
  unit: z.string(),
  costPerUnit: z.number().nonnegative().optional(),
  subtotalCost: z.number().nonnegative().optional(),
});
export type RecipeIngredient = z.infer<typeof RecipeIngredientSchema>;

export const ProductSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  sku: z.string().optional(),
  category: z.string(),
  sellingPrice: z.number().nonnegative(),
  costPrice: z.number().nonnegative().default(0),
  profitMarginPercent: z.number().optional(),
  imageUrl: z.string().url().optional(),
  isActive: z.boolean().default(true),
  ingredients: z.array(RecipeIngredientSchema).optional(),
  createdAt: z.string(),
});
export type Product = z.infer<typeof ProductSchema>;

export const CreateProductRequestSchema = z.object({
  name: z.string().min(1),
  sku: z.string().optional(),
  category: z.string(),
  sellingPrice: z.number().nonnegative(),
  imageUrl: z.string().url().optional(),
});
export type CreateProductRequest = z.infer<typeof CreateProductRequestSchema>;

export const UpdateRecipeRequestSchema = z.object({
  ingredients: z.array(RecipeIngredientSchema),
});
export type UpdateRecipeRequest = z.infer<typeof UpdateRecipeRequestSchema>;
