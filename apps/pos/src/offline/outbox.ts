import { CreateOrderRequest, OutboxStatus, provisionalQueueNo } from "@gunita/contracts";
import { posDb, OutboxOrderRecord } from "./db";

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
  // TODO: Emit sync event or trigger background sync registration
  return record;
}

/**
 * Reads all pending or failed orders ready for sync.
 */
export async function getPendingOutboxOrders(): Promise<OutboxOrderRecord[]> {
  return await posDb.ordersOutbox
    .where("status")
    .equals("pending")
    .or("status")
    .equals("failed")
    .toArray();
}

/**
 * Updates status of an outbox order record.
 */
export async function markOrderStatus(
  clientTxId: string,
  status: OutboxStatus,
  errorMessage?: string,
  serverOrderId?: string,
): Promise<void> {
  const updateData: Partial<OutboxOrderRecord> = {
    status,
    updatedAt: new Date().toISOString(),
  };

  if (errorMessage) {
    updateData.errorMessage = errorMessage;
  }

  if (serverOrderId) updateData.serverOrderId = serverOrderId;

  if (status === "synced") {
    updateData.syncedAt = new Date().toISOString();
  }

  // TODO: Add exponential backoff logic for repeated failed attempts
  await posDb.ordersOutbox.update(clientTxId, updateData);
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

/** Atomically increments the persisted OFF counter and returns the next provisional number (OFF-001, …). */
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
}
