import { describe, expect, it } from "vitest";
import { createState, MockError } from "../src/store/state";
import { advanceOrder, cancelOrder, listOrders, placeOrder } from "../src/store/orders";
import { NOW, USER, line, req, stockOf } from "./helpers";

const LATTE = "p-iced-spanish-latte";

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return (e as MockError).code;
  }
  return undefined;
}

describe("placeOrder", () => {
  it("deducts recipe and addon stock", () => {
    const s = createState("pos", NOW);
    const beans = stockOf(s, "i-beans");
    const before = s.stockTx.length;
    const o = placeOrder(s, req([line(s, LATTE, 2, ["Extra shot"])]), USER, NOW);
    expect(stockOf(s, "i-beans")).toBe(beans - 72);
    const rows = s.stockTx.slice(before);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.every((r) => r.type === "order_deduction" && r.reason?.startsWith("Order 2026"))).toBe(true);
    expect(rows.every((r) => r.createdBy === "Juan Dela Cruz")).toBe(true);
    expect(o.status).toBe("pending");
    expect(o.createdBy).toBe("u-juan");
    expect(o.cashierName).toBe("Juan Dela Cruz");
    expect(o.changeAmount).toBe(10);
    expect(o.orderNumber).toBe("20261103-A-013");
    expect(s.queue.seq).toBe(13);
  });

  it("rejects when combined lines exceed stock, leaving state untouched", () => {
    const s = createState("pos", NOW);
    s.ingredients.find((i) => i.id === "i-milk")!.currentStock = 200;
    const snapshot = JSON.stringify(s);
    const r = req([line(s, LATTE, 1), line(s, LATTE, 1, ["Extra shot"])]);
    expect(() => placeOrder(s, r, USER, NOW)).toThrow(/milk/i);
    expect(codeOf(() => placeOrder(s, r, USER, NOW))).toBe("INSUFFICIENT_STOCK");
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it("rejects underpayment", () => {
    const s = createState("pos", NOW);
    const r = req([line(s, LATTE, 1)]);
    expect(codeOf(() => placeOrder(s, { ...r, paidAmount: 1 }, USER, NOW))).toBe("VALIDATION");
  });
});

describe("cancelOrder / advanceOrder", () => {
  it("cancelOrder restores stock; completed orders cannot be cancelled", () => {
    const s = createState("pos", NOW);
    const beans = stockOf(s, "i-beans");
    const o = placeOrder(s, req([line(s, LATTE, 2, ["Extra shot"])]), USER, NOW);
    const before = s.stockTx.length;
    cancelOrder(s, o.id, USER, NOW);
    expect(stockOf(s, "i-beans")).toBe(beans);
    const rows = s.stockTx.slice(before);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.every((r) => r.type === "stock_in" && r.reason === `Cancelled ${o.orderNumber}`)).toBe(true);
    expect(o.status).toBe("cancelled");

    const o2 = placeOrder(s, req([line(s, LATTE, 1)], { clientTxId: "tx-2" }), USER, NOW);
    advanceOrder(s, o2.id);
    advanceOrder(s, o2.id);
    expect(() => cancelOrder(s, o2.id, USER, NOW)).toThrow(MockError);
  });

  it("advances pending -> preparing -> completed then throws", () => {
    const s = createState("pos", NOW);
    const o = placeOrder(s, req([line(s, LATTE, 1)]), USER, NOW);
    expect(advanceOrder(s, o.id).status).toBe("preparing");
    expect(advanceOrder(s, o.id).status).toBe("completed");
    expect(codeOf(() => advanceOrder(s, o.id))).toBe("VALIDATION");
    expect(codeOf(() => advanceOrder(s, "nope"))).toBe("NOT_FOUND");
  });
});

describe("listOrders", () => {
  it("filters by status, date and search; newest first", () => {
    const s = createState("pos", NOW);
    const o = placeOrder(s, req([line(s, LATTE, 1)]), USER, NOW);
    expect(listOrders(s, { search: "spanish" }).map((x) => x.id)).toContain(o.id);
    expect(listOrders(s, { search: "SPANISH" })[0]?.id).toBe(o.id);
    expect(listOrders(s, { search: "20261103-A-013" })).toHaveLength(1);
    expect(listOrders(s, { status: "pending" }).every((x) => x.status === "pending")).toBe(true);
    expect(listOrders(s, { status: "all" })).toHaveLength(s.orders.length);
    const today = listOrders(s, { date: "2026-11-03" });
    expect(today.length).toBeGreaterThan(0);
    expect(today[0]?.id).toBe(o.id);
    expect(today.length).toBeLessThan(s.orders.length);
  });
});
