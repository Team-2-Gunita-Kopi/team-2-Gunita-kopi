import { describe, expect, it } from "vitest";
import {
  ORDER_STATUS_LABEL,
  ORDER_TYPE_LABEL,
  canCancel,
  nextQueueNo,
  orderRefund,
  nextStatus,
  provisionalQueueNo,
} from "@/contracts/ui";

describe("order flow", () => {
  it("advances status", () => {
    expect(nextStatus("pending")).toBe("preparing");
    expect(nextStatus("preparing")).toBe("completed");
    expect(nextStatus("completed")).toBeNull();
    expect(nextStatus("cancelled")).toBeNull();
  });
  // Once preparing, the customer pays for the order: no cancel (decided 2026-11-28).
  it("allows cancelling only while pending", () => {
    expect(canCancel("pending")).toBe(true);
    expect(canCancel("preparing")).toBe(false);
    expect(canCancel("completed")).toBe(false);
    expect(canCancel("cancelled")).toBe(false);
  });
  // Nothing was made while pending, so every cancelled line is refunded at its full price;
  // the mockup's order 030: paid 250 = total 144 + change 7 + refunded 99.
  it("refunds the full price of the cancelled lines with their reasons", () => {
    const refund = orderRefund([
      { status: "pending", subtotal: 119, cancelReason: null },
      { status: "pending", subtotal: 25, cancelReason: null },
      { status: "cancelled", subtotal: 74, cancelReason: "Customer changed mind" },
      { status: "cancelled", subtotal: 25, cancelReason: "Customer changed mind" },
    ]);
    expect(refund).toEqual({ amount: 99, reason: "Customer changed mind" });
    expect(
      orderRefund([
        { status: "cancelled", subtotal: 10.1, cancelReason: "Wrong order" },
        { status: "cancelled", subtotal: 20.2, cancelReason: null },
        { status: "cancelled", subtotal: 5, cancelReason: "Item unavailable" },
      ]),
    ).toEqual({ amount: 35.3, reason: "Wrong order; Item unavailable" });
    expect(orderRefund([{ status: "completed", subtotal: 120 }])).toEqual({
      amount: 0,
      reason: null,
    });
  });
  it("has labels", () => {
    expect(ORDER_TYPE_LABEL["take-out"]).toBe("Take-out");
    expect(ORDER_TYPE_LABEL["pre-order"]).toBe("Pre-order");
    expect(ORDER_STATUS_LABEL.pending).toBeTruthy();
  });
});

describe("queue numbers", () => {
  const now = new Date(2026, 10, 16, 9);
  it("starts at 1", () => {
    expect(nextQueueNo(null, now).queueNo).toBe("20261116-A-001");
  });
  it("increments same day", () => {
    expect(nextQueueNo({ day: "20261116", seq: 41 }, now)).toEqual({
      queueNo: "20261116-A-042",
      day: "20261116",
      seq: 42,
    });
  });
  it("resets on new day", () => {
    expect(nextQueueNo({ day: "20261115", seq: 41 }, now).seq).toBe(1);
  });
  it("provisional", () => {
    expect(provisionalQueueNo(1)).toBe("OFF-001");
  });
});
