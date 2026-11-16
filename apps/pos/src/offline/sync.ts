import { SyncPayload, SyncResponse } from "@gunita/contracts";
import { getPendingOutboxOrders, markOrderStatus } from "./outbox";
import { apiClient } from "@/lib/api-client";

export interface SyncExecutionResult {
  total: number;
  synced: number;
  failed: number;
}

/**
 * Reads pending outbox orders and transmits them to POST /api/sync.
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
    const res = await apiClient<SyncResponse>("/api/sync", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (!res.success || !res.data) {
      // Revert in-flight orders back to failed on network/server error
      for (const item of pendingOrders) {
        await markOrderStatus(
          item.clientTxId,
          "failed",
          res.error?.message || "Sync failed",
        );
      }
      return {
        total: pendingOrders.length,
        synced: 0,
        failed: pendingOrders.length,
      };
    }

    let syncedCount = 0;
    let failedCount = 0;

    for (const result of res.data.results) {
      if (result.status === "synced" || result.status === "duplicate") {
        await markOrderStatus(result.transactionId, "synced");
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
