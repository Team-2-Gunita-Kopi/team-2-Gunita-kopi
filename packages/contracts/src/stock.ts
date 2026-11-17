import { z } from "zod";
import {
  DateSchema,
  IdSchema,
  PaginationQuerySchema,
  QuantitySchema,
  optionalText,
} from "./common";

// STOCK_TRANSACTIONS (FR-15 to FR-18). in = stock-in (Owner), out = stock-out (Barista).
export const StockTransactionTypeSchema = z.enum(["in", "out"]);
export type StockTransactionType = z.infer<typeof StockTransactionTypeSchema>;

export const StockTransactionSchema = z.object({
  id: z.number().int(),
  ingredientId: z.number().int(),
  ingredientName: z.string().nullable(),
  type: StockTransactionTypeSchema,
  quantity: z.number(),
  /** Stock left after this movement (set by the database). */
  remainingStock: z.number().nullable(),
  userId: z.number().int().nullable(),
  /** Null when the caller may not read that user's profile (baristas see only their own). */
  userName: z.string().nullable(),
  dateTime: z.string(),
  remarks: z.string().nullable(),
});
export type StockTransaction = z.infer<typeof StockTransactionSchema>;

/** The user is always the caller; it is never taken from the request. */
export const CreateStockTransactionRequestSchema = z.object({
  ingredientId: IdSchema,
  type: StockTransactionTypeSchema,
  quantity: QuantitySchema,
  remarks: optionalText(255),
});
export type CreateStockTransactionRequest = z.infer<
  typeof CreateStockTransactionRequestSchema
>;

export const StockTransactionListQuerySchema = PaginationQuerySchema.extend({
  ingredientId: IdSchema.optional(),
  type: StockTransactionTypeSchema.optional(),
  from: DateSchema.optional(),
  to: DateSchema.optional(),
});
export type StockTransactionListQuery = z.infer<
  typeof StockTransactionListQuerySchema
>;
