import type { SyncPayload, SyncResponse, SyncResultItem } from "@/contracts/ui";
import { MockError, type MockState } from "./state";
import { placeOrder } from "./orders";
import type { Actor } from "./stock";

/** Offline orders keep their real time; fall back to now when the client time is unusable. */
function when(iso: string, now: Date): Date {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? now : d;
}

export function syncOrders(state: MockState, payload: SyncPayload, user: Actor, now: Date): SyncResponse {
  const results: SyncResultItem[] = [];
  for (const item of payload.orders) {
    const seen = state.orders.find((o) => o.clientTxId === item.transactionId);
    if (seen) {
      results.push({ transactionId: item.transactionId, orderId: seen.id, orderNumber: seen.orderNumber, status: "duplicate" });
      continue;
    }
    try {
      const order = placeOrder(state, { ...item.order, clientTxId: item.transactionId }, user, now, when(item.createdAt, now));
      results.push({ transactionId: item.transactionId, orderId: order.id, orderNumber: order.orderNumber, status: "synced" });
    } catch (e) {
      if (!(e instanceof MockError)) throw e;
      results.push({ transactionId: item.transactionId, status: "failed", error: e.message });
    }
  }
  return { processedCount: results.length, results };
}
