import type { SyncPayload } from "@gunita/contracts";
import { getPendingOutboxOrders, markOrderStatus, outboxStore } from "./outbox";
import { posDb } from "./db";
import { posData } from "@/features/pos";
import { getSession } from "@/features/auth";
import { isOnline } from "@/lib/connectivity";

export interface SyncExecutionResult {
  total: number;
  synced: number;
  failed: number;
}

const EMPTY: SyncExecutionResult = { total: 0, synced: 0, failed: 0 };

async function runSync(): Promise<SyncExecutionResult> {
  // Nothing is attempted (and nothing is marked failed) while the device is offline.
  if (!isOnline()) return EMPTY;
  // Runs are serialized, so any record still `syncing` was left by an interrupted run (tab closed/crashed).
  const stale = await posDb.ordersOutbox.where("status").equals("syncing").toArray();
  for (const r of stale) await markOrderStatus(r.clientTxId, "pending");
  const pendingOrders = await getPendingOutboxOrders();
  if (pendingOrders.length === 0) return EMPTY;

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

    let synced = 0;
    let failed = 0;
    const answered = new Set<string>();
    for (const result of res.results) {
      answered.add(result.transactionId);
      if (result.status === "synced" || result.status === "duplicate") {
        let orderNumber = result.orderNumber;
        if (!orderNumber && result.orderId) {
          orderNumber = await posData
            .getOrder(result.orderId)
            .then((o) => o.orderNumber)
            .catch(() => undefined);
        }
        await markOrderStatus(result.transactionId, "synced", undefined, result.orderId, orderNumber ? { orderNumber } : {});
        synced++;
      } else {
        const rec = await posDb.ordersOutbox.get(result.transactionId);
        await markOrderStatus(result.transactionId, "failed", result.error ?? "The server rejected this order.", undefined, {
          rejected: true,
          retryCount: (rec?.retryCount ?? 0) + 1,
        });
        failed++;
      }
    }
    // Orders the server did not answer for are retried on the next trigger.
    for (const item of pendingOrders) {
      if (answered.has(item.clientTxId)) continue;
      await markOrderStatus(item.clientTxId, "failed", "No response from the server.", undefined, {
        rejected: false,
        retryCount: item.retryCount + 1,
      });
      failed++;
    }
    return { total: pendingOrders.length, synced, failed };
  } catch (error) {
    // A thrown error never marks anything synced; the orders stay queued and are retried later.
    const message = error instanceof Error ? error.message : "Unknown sync error";
    for (const item of pendingOrders) {
      await markOrderStatus(item.clientTxId, "failed", message, undefined, {
        rejected: false,
        retryCount: item.retryCount + 1,
      }).catch(() => undefined);
    }
    return { total: pendingOrders.length, synced: 0, failed: pendingOrders.length };
  }
}

let queue: Promise<unknown> = Promise.resolve();
let running = 0;

/**
 * The single sync entry point (triggers, checkout, the Sync now button). Runs are serialized, so
 * overlapping calls never submit the same order twice. Never rejects.
 */
export function syncOutboxOrders(): Promise<SyncExecutionResult> {
  running++;
  outboxStore.setState({ isSyncing: true });
  const result = queue.then(runSync).catch(() => EMPTY);
  queue = result;
  return result.finally(() => {
    running--;
    if (running === 0) outboxStore.setState({ isSyncing: false });
  });
}

/** Puts a failed order back in the queue and submits it again. */
export async function retryOrder(clientTxId: string): Promise<void> {
  const rec = await posDb.ordersOutbox.get(clientTxId);
  if (!rec || rec.status !== "failed") return;
  await markOrderStatus(clientTxId, "pending", undefined, undefined, { rejected: false });
  await syncOutboxOrders();
}

/** Removes a failed order from the outbox. Callers confirm with the user first. */
export async function discardOrder(clientTxId: string): Promise<boolean> {
  const rec = await posDb.ordersOutbox.get(clientTxId);
  if (!rec || rec.status !== "failed") return false;
  await posDb.ordersOutbox.delete(clientTxId);
  outboxStore.setState((s) => ({ version: s.version + 1 }));
  return true;
}
