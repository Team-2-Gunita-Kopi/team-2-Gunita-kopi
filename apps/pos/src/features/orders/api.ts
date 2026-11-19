import { OrderSchema, pageOf, type Order, type OrderStatus } from "@gunita/contracts";
import { apiAllPages, apiData } from "@/lib/api-client";
import { formatPeso } from "@gunita/ui";

/** Business day in the shop's time zone (the API filters order dates in Asia/Manila). */
export function manilaToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(now);
}

/** FR-10: today's queue and orders, newest first. */
export function listTodayOrders(): Promise<Order[]> {
  return apiAllPages(`/api/orders?from=${manilaToday()}`, pageOf(OrderSchema));
}

/** The database enforces the transitions (INVALID_TRANSITION otherwise). */
export const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  pending: "preparing",
  preparing: "completed",
};

export function updateOrderStatus(orderId: number, status: OrderStatus): Promise<Order> {
  return apiData(`/api/orders/${orderId}`, OrderSchema, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export interface OrderBoardRow extends Record<string, unknown> {
  id: string;
  orderId: number | null;
  orderNumber: string;
  type: string;
  items: string;
  total: string;
  status: string;
  syncState: string;
}

/** Product rows only; add-ons are shown with their product on the receipt. */
export function toOrderBoardRow(o: Order): OrderBoardRow {
  return {
    id: String(o.orderId),
    orderId: o.orderId,
    orderNumber: `#${o.orderId}`,
    type: o.orderType ?? "",
    items: o.items
      .filter((l) => !l.isAddon)
      .map((l) => `${l.quantity}x ${l.name ?? "Item"}`)
      .join(", "),
    total: formatPeso(o.total),
    status: o.status,
    syncState: "synced",
  };
}
