import { createStore } from "zustand";
import { CreateOrderRequest, OutboxStatus, provisionalQueueNo } from "@gunita/contracts";
import { posDb, OutboxOrderRecord } from "./db";

/** Bumped on every outbox change so hooks can re-read counts; `isSyncing` mirrors a running sync. */
export const outboxStore = createStore<{ version: number; isSyncing: boolean }>(() => ({ version: 0, isSyncing: false }));
const touch = () => outboxStore.setState((s) => ({ version: s.version + 1 }));

/**
 * Saves a new order to the offline Dexie outbox with status 'pending'.
 */
export async function saveOrderToOutbox(
  order: CreateOrderRequest,
  provisionalNo?: string,
): Promise<OutboxOrderRecord> {
  const now = new Date().toISOString();
  const record: OutboxOrderRecord = {
    clientTxId: order.clientTxId,
    order,
    status: "pending",
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
    ...(provisionalNo ? { provisionalNo } : {}),
  };

  await posDb.ordersOutbox.put(record);
  touch();
  return record;
}

/**
 * Reads orders ready for sync: pending ones, and failed ones whose last attempt was a transient
 * error. Orders the server rejected stay failed until `retryOrder` or `discardOrder`.
 */
export async function getPendingOutboxOrders(): Promise<OutboxOrderRecord[]> {
  const rows = await posDb.ordersOutbox.where("status").anyOf("pending", "failed").toArray();
  return rows.filter((r) => !r.rejected);
}

/**
 * Updates status of an outbox order record.
 */
export async function markOrderStatus(
  clientTxId: string,
  status: OutboxStatus,
  errorMessage?: string,
  serverOrderId?: string,
  patch: Partial<OutboxOrderRecord> = {},
): Promise<void> {
  const updateData: Partial<OutboxOrderRecord> = {
    ...patch,
    status,
    updatedAt: new Date().toISOString(),
  };

  if (errorMessage) {
    updateData.errorMessage = errorMessage;
  }

  if (serverOrderId) updateData.serverOrderId = serverOrderId;

  if (status === "synced") {
    updateData.syncedAt = new Date().toISOString();
    updateData.errorMessage = undefined;
    updateData.rejected = false;
  }

  await posDb.ordersOutbox.update(clientTxId, updateData);
  touch();
}

/** Outbox counts: `pending` = waiting or in flight, `failed` = needs attention or a retry. */
export async function getOutboxCounts(): Promise<{ pending: number; failed: number }> {
  try {
    const [pending, syncing, failed] = await Promise.all([
      posDb.ordersOutbox.where("status").equals("pending").count(),
      posDb.ordersOutbox.where("status").equals("syncing").count(),
      posDb.ordersOutbox.where("status").equals("failed").count(),
    ]);
    return { pending: pending + syncing, failed };
  } catch {
    return { pending: 0, failed: 0 };
  }
}

/**
 * Returns count of orders currently pending sync.
 */
export async function getPendingSyncCount(): Promise<number> {
  try {
    return await posDb.ordersOutbox.where("status").equals("pending").count();
  } catch {
    return 0;
  }
}

const OFF_COUNTER_KEY = "offlineCounter";

/** Atomically increments the persisted OFF counter and returns the next provisional number (OFF-001, ...). */
export async function nextProvisionalNo(): Promise<string> {
  return posDb.transaction("rw", posDb.meta, async () => {
    const cur = await posDb.meta.get(OFF_COUNTER_KEY);
    const n = (typeof cur?.value === "number" ? cur.value : 0) + 1;
    await posDb.meta.put({ key: OFF_COUNTER_KEY, value: n });
    return provisionalQueueNo(n);
  });
}

export async function setProvisionalNo(clientTxId: string, provisionalNo: string): Promise<void> {
  await posDb.ordersOutbox.update(clientTxId, { provisionalNo, updatedAt: new Date().toISOString() });
  touch();
}
