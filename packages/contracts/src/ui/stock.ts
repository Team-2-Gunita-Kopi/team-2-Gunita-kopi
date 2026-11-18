import { z } from "zod";

export const StockTransactionTypeSchema = z.enum([
  "stock_in",
  "stock_out",
  "waste",
  "adjustment",
  "order_deduction",
]);
export type StockTransactionType = z.infer<typeof StockTransactionTypeSchema>;

export const StockTransactionSchema = z.object({
  id: z.string(),
  ingredientId: z.string(),
  ingredientName: z.string().optional(),
  type: StockTransactionTypeSchema,
  quantityChange: z.number(),
  previousStock: z.number(),
  newStock: z.number(),
  referenceId: z.string().optional(),
  reason: z.string().optional(),
  createdAt: z.string(),
  createdBy: z.string(),
});
export type StockTransaction = z.infer<typeof StockTransactionSchema>;

export const CreateStockTransactionRequestSchema = z.object({
  ingredientId: z.string().min(1),
  type: z.enum(["stock_in", "stock_out", "waste", "adjustment"]),
  quantityChange: z.number(),
  reason: z.string().optional(),
});
export type CreateStockTransactionRequest = z.infer<
  typeof CreateStockTransactionRequestSchema
>;
