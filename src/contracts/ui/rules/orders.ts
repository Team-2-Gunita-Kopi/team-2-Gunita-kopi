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

/** Only while pending: once preparing the customer pays for the order (decided 2026-11-28). */
export function canCancel(s: OrderStatus): boolean {
  return s === "pending";
}

/** Reasons offered when items are cancelled; "Other" asks for a short note instead. */
export const CANCEL_REASONS = [
  "Customer changed mind",
  "Wrong order",
  "Item unavailable",
  "Other",
] as const;

/**
 * Refund of an order: the full price of every cancelled line (items are cancelled only while
 * pending, so nothing was made), and the reasons given, in the order they were cancelled.
 */
export function orderRefund(
  lines: {
    status: OrderStatus;
    subtotal: number;
    cancelReason?: string | null;
  }[],
): { amount: number; reason: string | null } {
  const cancelled = lines.filter((l) => l.status === "cancelled");
  const amount =
    Math.round(cancelled.reduce((sum, l) => sum + l.subtotal, 0) * 100) / 100;
  const reasons = [
    ...new Set(
      cancelled.flatMap((l) => (l.cancelReason ? [l.cancelReason] : [])),
    ),
  ];
  return { amount, reason: reasons.length ? reasons.join("; ") : null };
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
