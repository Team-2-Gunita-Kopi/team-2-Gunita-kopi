import type { SyncPayload } from "@gunita/contracts";
import { getPendingOutboxOrders, markOrderStatus } from "./outbox";
import { posData } from "@/features/pos";
import { getSession } from "@/features/auth";

export interface SyncExecutionResult {
  total: number;
  synced: number;
  failed: number;
}

/**
 * Reads pending outbox orders and transmits them through the POS data layer (POST /api/sync).
 * Updates local Dexie status based on API commit confirmation.
 */
export async function syncOutboxOrders(): Promise<SyncExecutionResult> {
  const pendingOrders = await getPendingOutboxOrders();

  if (pendingOrders.length === 0) {
    return { total: 0, synced: 0, failed: 0 };
  }

  // Mark in-flight orders as 'syncing'
  for (const item of pendingOrders) {
    await markOrderStatus(item.clientTxId, "syncing");
  }

  const payload: SyncPayload = {
    batchId: `batch_${Date.now()}`,
    orders: pendingOrders.map((p) => ({
      transactionId: p.clientTxId,
      order: p.order,
      createdAt: p.createdAt,
    })),
  };

  // TODO: Implement batch chunking if pending count exceeds 50 orders
  try {
    const session = getSession();
    const actor = { id: session?.userId ?? "", fullName: session?.fullName ?? "" };
    const res = await posData.syncOrders(payload, actor);

    let syncedCount = 0;
    let failedCount = 0;

    for (const result of res.results) {
      if (result.status === "synced" || result.status === "duplicate") {
        await markOrderStatus(result.transactionId, "synced", undefined, result.orderId);
        syncedCount++;
      } else {
        await markOrderStatus(result.transactionId, "failed", result.error);
        failedCount++;
      }
    }

    return {
      total: pendingOrders.length,
      synced: syncedCount,
      failed: failedCount,
    };
  } catch (error) {
    for (const item of pendingOrders) {
      await markOrderStatus(
        item.clientTxId,
        "failed",
        error instanceof Error ? error.message : "Unknown sync error",
      );
    }
    return {
      total: pendingOrders.length,
      synced: 0,
      failed: pendingOrders.length,
    };
  }
}
