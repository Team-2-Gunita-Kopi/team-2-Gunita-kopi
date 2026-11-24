import { z } from "zod";
import { CreateOrderRequestSchema } from "./orders";
import { MAX_SYNC_ORDERS } from "./common";

export const OutboxStatusSchema = z.enum([
  "pending",
  "syncing",
  "synced",
  "failed",
]);
export type OutboxStatus = z.infer<typeof OutboxStatusSchema>;

export const SyncOrderItemSchema = z
  .object({
    transactionId: z.string().min(1, "transactionId is required"),
    order: CreateOrderRequestSchema,
    createdAt: z.string(),
  })
  // The POS marks results by transactionId; the database deduplicates by clientTxId.
  .refine((o) => o.transactionId === o.order.clientTxId, {
    path: ["transactionId"],
    message: "transactionId must equal order.clientTxId",
  });
export type SyncOrderItem = z.infer<typeof SyncOrderItemSchema>;

export const SyncPayloadSchema = z.object({
  batchId: z.string().optional(),
  orders: z
    .array(SyncOrderItemSchema)
    .min(1, "At least one order must be provided in sync")
    .max(MAX_SYNC_ORDERS),
});
export type SyncPayload = z.infer<typeof SyncPayloadSchema>;

/**
 * synced: saved now. duplicate: saved by an earlier request (safe to mark synced).
 * conflict: stock or price changed, or a product is unavailable; show it to the staff (FR-60).
 * failed: invalid order or server error; not saved.
 * Only synced and duplicate carry orderId, the final queue number.
 */
export const SyncResultItemSchema = z.object({
  transactionId: z.string(),
  orderId: z.string().optional(),
  status: z.enum(["synced", "duplicate", "conflict", "failed"]),
  code: z.string().optional(),
  error: z.string().optional(),
});
export type SyncResultItem = z.infer<typeof SyncResultItemSchema>;

export const SyncResponseSchema = z.object({
  processedCount: z.number().int().nonnegative(),
  results: z.array(SyncResultItemSchema),
});
export type SyncResponse = z.infer<typeof SyncResponseSchema>;
