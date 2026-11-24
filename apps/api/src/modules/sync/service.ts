import { SyncPayload, SyncResponse } from "./schema";
import { SyncResultItem } from "@gunita/contracts";
import { logger } from "@/lib/logger";
import { AuthenticatedUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { checkout } from "@/modules/orders/service";

const CONFLICT_CODES = new Set([
  "STOCK_CONFLICT",
  "PRICE_CONFLICT",
  "CONFLICT",
]);

/**
 * Saves each offline order through the shared atomic checkout, under the barista's own token.
 * Each order commits or fails on its own, so one conflict does not block the batch (FR-58 to FR-60).
 * An order is reported synced or duplicate only after the database returned its order_id (FR-59).
 */
export async function processSyncOrders(
  user: AuthenticatedUser,
  payload: SyncPayload,
): Promise<SyncResponse> {
  const results: SyncResultItem[] = [];

  for (const { transactionId, order } of payload.orders) {
    try {
      const { orderId, duplicate } = await checkout(user, order);
      results.push({
        transactionId,
        orderId: String(orderId),
        status: duplicate ? "duplicate" : "synced",
      });
    } catch (error) {
      // Business failures go back to the POS; anything else is logged and reported generically
      // so database internals never reach the client.
      const known = error instanceof AppError && error.statusCode < 500;
      if (!known) {
        logger.error("sync.checkout_failed", {
          transactionId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      results.push({
        transactionId,
        status: known && CONFLICT_CODES.has(error.code) ? "conflict" : "failed",
        code: known ? error.code : "INTERNAL_SERVER_ERROR",
        error: known ? error.message : "Checkout could not be saved",
      });
    }
  }

  return { processedCount: results.length, results };
}
