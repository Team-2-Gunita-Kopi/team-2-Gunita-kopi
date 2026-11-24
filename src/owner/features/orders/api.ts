import {
  OrderSchema,
  pageOf,
  type Order,
  type OrderStatus,
} from "@/contracts";
import { apiAllPages, apiData } from "@/owner/lib/api-client";

export interface OrdersFilter {
  status?: OrderStatus | "all";
  date?: string;
}

/** Business day in the shop's time zone (the API filters order dates in Asia/Manila). */
export function manilaToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(
    now,
  );
}

/** Owner order board (SDS UI 593, FR-10). Monitoring only: checkout stays on the POS. */
export const listTodayOrders = (): Promise<Order[]> =>
  apiAllPages(`/api/orders?from=${manilaToday()}`, pageOf(OrderSchema));

export const getOrder = (orderId: number): Promise<Order> =>
  apiData(`/api/orders/${orderId}`, OrderSchema);

export function listOrders(filters: OrdersFilter = {}): Promise<Order[]> {
  const query = new URLSearchParams();
  if (filters.status && filters.status !== "all") {
    query.set("status", filters.status);
  }
  if (filters.date) {
    query.set("from", filters.date);
    query.set("to", filters.date);
  }
  const params = query.toString();
  const suffix = params ? `?${params}` : "";
  return apiAllPages(`/api/orders${suffix}`, pageOf(OrderSchema));
}

export const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  pending: "preparing",
  preparing: "completed",
};

export const updateOrderStatus = (
  orderId: number,
  status: OrderStatus,
): Promise<Order> =>
  apiData(`/api/orders/${orderId}`, OrderSchema, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
