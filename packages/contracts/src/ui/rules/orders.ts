import type { OrderStatus, OrderType } from "../orders";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Pending",
  preparing: "Preparing",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const ORDER_TYPE_LABEL: Record<OrderType, string> = {
  "dine-in": "Dine-in",
  "take-out": "Take-out",
  "pre-order": "Pre-order",
  online: "Online",
};

export function nextStatus(s: OrderStatus): OrderStatus | null {
  if (s === "pending") return "preparing";
  if (s === "preparing") return "completed";
  return null;
}

export function canCancel(s: OrderStatus): boolean {
  return s === "pending" || s === "preparing";
}

/** Queue number using LOCAL date parts; seq resets when the day changes. */
export function nextQueueNo(
  prev: { day: string; seq: number } | null,
  now: Date,
  prefix = "A",
): { queueNo: string; day: string; seq: number } {
  const day =
    String(now.getFullYear()) +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0");
  const seq = prev && prev.day === day ? prev.seq + 1 : 1;
  return { queueNo: `${day}-${prefix}-${String(seq).padStart(3, "0")}`, day, seq };
}

export function provisionalQueueNo(n: number): string {
  return `OFF-${String(n).padStart(3, "0")}`;
}
