import { describe, expect, it } from "vitest";
import { createState } from "../src/store/state";
import { advanceOrder, cancelOrder, placeOrder } from "../src/store/orders";
import { bestSellers, dailySales, getDashboard, monthlySales, stockStatusReport } from "../src/store/reports";
import { localDay } from "../src/store/stock";
import { NOW, USER, line, req } from "./helpers";

const fresh = () => createState("owner", NOW);
const today = localDay(NOW.toISOString());

describe("reports", () => {
  it("counts only completed orders", () => {
    const s = fresh();
    const before = dailySales(s, 14, NOW).find((d) => d.date === today)!;
    const o = placeOrder(s, req([line(s, "p-iced-americano", 2)]), USER, NOW);
    expect(dailySales(s, 14, NOW).find((d) => d.date === today)).toEqual(before);
    cancelOrder(s, o.id, USER, NOW);
    expect(dailySales(s, 14, NOW).find((d) => d.date === today)).toEqual(before);
    const o2 = placeOrder(s, req([line(s, "p-iced-americano", 2)], { clientTxId: "tx-2" }), USER, NOW);
    advanceOrder(s, o2.id); advanceOrder(s, o2.id);
    const after = dailySales(s, 14, NOW).find((d) => d.date === today)!;
    expect(after.totalSales).toBe(before.totalSales + o2.totalAmount);
    expect(after.orderCount).toBe(before.orderCount + 1);
  });
  it("computes cogs, profit and ticket", () => {
    const s = fresh();
    const d = dailySales(s, 7, NOW);
    expect(d).toHaveLength(7);
    expect(d[6]!.date).toBe(today);
    for (const r of d) {
      expect(r.grossProfit).toBeCloseTo(r.totalSales - r.cogs, 2);
      if (r.orderCount) expect(r.averageTicket).toBeCloseTo(r.totalSales / r.orderCount, 2);
    }
    expect(d.some((r) => r.cogs > 0)).toBe(true);
  });
  it("monthly reports roll up the daily breakdown", () => {
    const m = monthlySales(fresh(), 2, NOW);
    expect(m).toHaveLength(2);
    const cur = m[1]!;
    expect(cur.month).toBe("2026-11");
    expect(cur.totalSales).toBeCloseTo(cur.dailyBreakdown.reduce((s, d) => s + d.totalSales, 0), 2);
  });
  it("best sellers sort by quantity desc within the range", () => {
    const s = fresh();
    const rows = bestSellers(s, "2000-01-01", "2100-01-01");
    expect(rows.length).toBeGreaterThan(0);
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1]!.quantitySold).toBeGreaterThanOrEqual(rows[i]!.quantitySold);
    expect(bestSellers(s, "2000-01-01", "2000-01-02")).toEqual([]);
  });
  it("stock status report lists urgent items first with unit cost", () => {
    const r = stockStatusReport(fresh());
    expect(r[0]!.status).toBe("out_of_stock");
    expect(r.find((x) => x.ingredientId === "i-beans")?.unitCost).toBe(0.9);
  });
});

describe("dashboard", () => {
  it("summarises today", () => {
    const s = fresh();
    const d = getDashboard(s, NOW);
    expect(d.date).toBe(today);
    expect(d.isFallbackDay).toBe(false);
    expect(d.topProducts.length).toBeLessThanOrEqual(5);
    expect(d.recentOrders.length).toBeLessThanOrEqual(6);
    expect(d.lowStock.every((i) => i.status !== "ok")).toBe(true);
    const open = s.orders.filter((o) => localDay(o.createdAt) === today && ["pending", "preparing"].includes(o.status)).length;
    expect(d.openOrdersCount).toBe(open);
  });
  it("falls back to the latest day with orders", () => {
    const s = fresh();
    s.orders = s.orders.filter((o) => localDay(o.createdAt) !== today);
    const latest = s.orders.map((o) => localDay(o.createdAt)).sort().pop()!;
    const d = getDashboard(s, NOW);
    expect(d.isFallbackDay).toBe(true);
    expect(d.date).toBe(latest);
  });
});
