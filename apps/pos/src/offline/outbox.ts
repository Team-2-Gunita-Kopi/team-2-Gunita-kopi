import { CreateOrderRequest, OutboxStatus } from "@gunita/contracts";
import { posDb, OutboxOrderRecord } from "./db";

/**
 * Saves a new order to the offline Dexie outbox with status 'pending'.
 */
export async function saveOrderToOutbox(
  order: CreateOrderRequest,
): Promise<OutboxOrderRecord> {
  const now = new Date().toISOString();
  const record: OutboxOrderRecord = {
    clientTxId: order.clientTxId,
    order,
    status: "pending",
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
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
): Promise<void> {
  const updateData: Partial<OutboxOrderRecord> = {
    status,
    updatedAt: new Date().toISOString(),
  };

  if (errorMessage) {
    updateData.errorMessage = errorMessage;
  }

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
