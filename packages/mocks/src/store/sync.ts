import type { SyncPayload, SyncResponse, SyncResultItem } from "@gunita/contracts";
import { MockError, type MockState } from "./state";
import { placeOrder } from "./orders";
import type { Actor } from "./stock";

export function syncOrders(state: MockState, payload: SyncPayload, user: Actor, now: Date): SyncResponse {
  const results: SyncResultItem[] = [];
  for (const item of payload.orders) {
    const seen = state.orders.find((o) => o.clientTxId === item.transactionId);
    if (seen) {
      results.push({ transactionId: item.transactionId, orderId: seen.id, status: "duplicate" });
      continue;
    }
    try {
      const order = placeOrder(state, { ...item.order, clientTxId: item.transactionId }, user, now);
      results.push({ transactionId: item.transactionId, orderId: order.id, status: "synced" });
    } catch (e) {
      if (!(e instanceof MockError)) throw e;
      results.push({ transactionId: item.transactionId, status: "failed", error: e.message });
    }
  }
  return { processedCount: results.length, results };
}
