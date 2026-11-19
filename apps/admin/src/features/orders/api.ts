import { OrderSchema, pageOf, type Order, type OrderStatus } from "@gunita/contracts";
import { apiAllPages, apiData } from "@/lib/api-client";

/** Business day in the shop's time zone (the API filters order dates in Asia/Manila). */
export function manilaToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(now);
}

/** Owner order board (SDS UI 593, FR-10). Monitoring only: checkout stays on the POS. */
export const listTodayOrders = (): Promise<Order[]> =>
  apiAllPages(`/api/orders?from=${manilaToday()}`, pageOf(OrderSchema));

export const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  pending: "preparing",
  preparing: "completed",
};

export const updateOrderStatus = (orderId: number, status: OrderStatus): Promise<Order> =>
  apiData(`/api/orders/${orderId}`, OrderSchema, { method: "PATCH", body: JSON.stringify({ status }) });
