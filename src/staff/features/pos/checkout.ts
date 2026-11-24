import { computeChange, orderTotal, toOrderItems, type CartLine, type CreateOrderRequest, type Order, type OrderType } from "@/contracts/ui";
import type { MockSession } from "@/auth";
import { isOnline } from "@/staff/lib/connectivity";
import { nextProvisionalNo, saveOrderToOutbox, setProvisionalNo } from "@/staff/offline/outbox";
import { posDb, type OutboxOrderRecord } from "@/staff/offline/db";
import { syncOutboxOrders } from "@/staff/offline/sync";
import { posData } from "./index";

export interface CheckoutInput {
  lines: CartLine[];
  type: OrderType;
  paid: number;
  cashier: MockSession;
}

/**
 * Saves the order to the outbox first, then (when online) syncs it. A failed or offline
 * sync is not an error: the order stays queued and the record carries an OFF-nnn number.
 */
export async function checkout(input: CheckoutInput): Promise<{ record: OutboxOrderRecord; order?: Order }> {
  const total = orderTotal(input.lines);
  const request: CreateOrderRequest = {
    clientTxId: globalThis.crypto.randomUUID(),
    type: input.type,
    items: toOrderItems(input.lines),
    totalAmount: total,
    taxAmount: 0,
    discountAmount: 0,
    paidAmount: input.paid,
    paymentMethod: "cash",
  };

  const online = isOnline();
  let record = await saveOrderToOutbox(request, online ? undefined : await nextProvisionalNo());
  let order: Order | undefined;

  if (online) {
    // The order is already saved: nothing below may fail the checkout.
    try {
      await syncOutboxOrders();
    } catch {
      // saved, pending sync
    }
    const synced = await posDb.ordersOutbox.get(request.clientTxId).catch(() => undefined);
    if (synced) record = synced;
    if (synced?.status === "synced") {
      if (synced.serverOrderId) order = await posData.getOrder(synced.serverOrderId).catch(() => undefined);
    } else {
      try {
        const provisionalNo = await nextProvisionalNo();
        await setProvisionalNo(request.clientTxId, provisionalNo);
        record = { ...record, provisionalNo };
      } catch {
        // numbering is cosmetic; the order stays queued
      }
    }
  }
  return { record, order };
}

/** Receipt-shaped view of a queued (not yet synced) order. */
export function recordToOrder(record: OutboxOrderRecord, cashier: { userId: string; fullName: string }): Order {
  const o = record.order;
  const change = computeChange(o.totalAmount, o.paidAmount);
  return {
    id: record.clientTxId,
    clientTxId: record.clientTxId,
    orderNumber: record.provisionalNo ?? record.serverOrderId,
    status: "pending",
    type: o.type,
    items: o.items,
    totalAmount: o.totalAmount,
    taxAmount: o.taxAmount,
    discountAmount: o.discountAmount,
    paidAmount: o.paidAmount,
    changeAmount: change.ok ? change.change : 0,
    paymentMethod: o.paymentMethod,
    createdAt: record.createdAt,
    createdBy: cashier.userId,
    cashierName: cashier.fullName,
  };
}
