import {
  OrderSchema,
  pageOf,
  type Order,
  type OrderStatus,
} from "@/contracts";
import { apiAllPages, apiData } from "@/staff/lib/api-client";

export interface OrdersFilter {
  status?: OrderStatus | "all";
  date?: string;
}

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
  return apiAllPages(
    `/api/orders${params ? `?${params}` : ""}`,
    pageOf(OrderSchema),
  );
}

export const getOrder = (orderId: number): Promise<Order> =>
  apiData(`/api/orders/${orderId}`, OrderSchema);

export const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  pending: "preparing",
  preparing: "completed",
};

export function updateOrderStatus(
  orderId: number,
  status: OrderStatus,
): Promise<Order> {
  return apiData(`/api/orders/${orderId}`, OrderSchema, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}
export function cancelOrderItems(
  orderId: number,
  items: { lineId: number; quantity: number }[],
): Promise<Order> {
  return apiData(`/api/orders/${orderId}/cancel-items`, OrderSchema, {
    method: "POST",
    body: JSON.stringify({ items }),
  });
}