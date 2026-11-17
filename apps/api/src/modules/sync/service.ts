import { SyncPayload, SyncResponse } from "./schema";
import { CreateOrderRequest, SyncResultItem } from "@gunita/contracts";
import { logger } from "@/lib/logger";
import { AuthenticatedUser } from "@/lib/auth";

interface CheckoutResult {
  order_id: number;
  duplicate: boolean;
}

/** Maps the contract to the jsonb shape process_checkout_transaction expects. */
export function toCheckoutPayload(order: CreateOrderRequest) {
  return {
    client_tx_id: order.clientTxId,
    order_type: order.type,
    payment_method: order.paymentMethod,
    amount_paid: order.paidAmount,
    items: order.items.map((item) => ({
      is_addon: item.isAddon ?? false,
      product_id: item.isAddon ? null : Number(item.productId),
      ingredient_id: item.isAddon ? Number(item.ingredientId) : null,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      customization: item.customization ?? null,
      special_instructions: item.specialInstructions ?? item.notes ?? null,
    })),
  };
}

/**
 * Saves each offline order through the atomic checkout function, under the barista's own token (RLS applies).
 * Each order commits or fails on its own, so one stock/price conflict does not block the batch (FR-58 to FR-60).
 */
export async function processSyncOrders(
  user: AuthenticatedUser,
  payload: SyncPayload,
): Promise<SyncResponse> {
  const results: SyncResultItem[] = [];

  for (const { transactionId, order } of payload.orders) {
    const { data, error } = await user.supabaseClient.rpc(
      "process_checkout_transaction",
      { p_order: toCheckoutPayload(order) },
    );

    if (error || !data) {
      // Business conflicts raised by the checkout function go back to the POS; anything else is
      // logged and reported generically so database internals never reach the client.
      const message = error?.message ?? "";
      const known = /^(STOCK_CONFLICT|PRICE_CONFLICT|VALIDATION)/.test(message);
      if (!known) {
        logger.error("sync.checkout_failed", { transactionId, error: message });
      }
      results.push({
        transactionId,
        status: "failed",
        error: known ? message : "Checkout could not be saved",
      });
      continue;
    }

    const result = data as unknown as CheckoutResult;
    results.push({
      transactionId,
      orderId: String(result.order_id),
      status: result.duplicate ? "duplicate" : "synced",
    });
  }

  return { processedCount: results.length, results };
}
