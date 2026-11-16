import { z } from "zod";
import { CreateOrderRequestSchema } from "./orders";

export const OutboxStatusSchema = z.enum([
  "pending",
  "syncing",
  "synced",
  "failed",
]);
export type OutboxStatus = z.infer<typeof OutboxStatusSchema>;

export const SyncOrderItemSchema = z.object({
  transactionId: z.string().min(1, "transactionId is required"),
  order: CreateOrderRequestSchema,
  createdAt: z.string(),
});
export type SyncOrderItem = z.infer<typeof SyncOrderItemSchema>;

export const SyncPayloadSchema = z.object({
  batchId: z.string().optional(),
  orders: z
    .array(SyncOrderItemSchema)
    .min(1, "At least one order must be provided in sync"),
});
export type SyncPayload = z.infer<typeof SyncPayloadSchema>;

export const SyncResultItemSchema = z.object({
  transactionId: z.string(),
  orderId: z.string().optional(),
  status: z.enum(["synced", "duplicate", "failed"]),
  error: z.string().optional(),
});
export type SyncResultItem = z.infer<typeof SyncResultItemSchema>;

export const SyncResponseSchema = z.object({
  processedCount: z.number().int().nonnegative(),
  results: z.array(SyncResultItemSchema),
});
export type SyncResponse = z.infer<typeof SyncResponseSchema>;
