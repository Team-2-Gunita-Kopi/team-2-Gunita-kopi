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
  const at = (daysBack: number, h: number) => new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - daysBack, h);
  const complete = (s: ReturnType<typeof fresh>, id: string) => { advanceOrder(s, id); advanceOrder(s, id); };
  const place = (s: ReturnType<typeof fresh>, tx: string, pid: string, qty: number, when: Date) =>
    placeOrder(s, req([line(s, pid, qty)], { clientTxId: tx }), USER, NOW, when);

  // Controlled state: no seeded orders.
  function controlled() {
    const s = fresh();
    s.orders = [];
    return s;
  }

  it("pins today's figures", () => {
    const s = controlled();
    const a = place(s, "a", "p-iced-americano", 2, at(0, 9)); // 220, completed
    const b = place(s, "b", "p-ensaymada", 1, at(0, 10)); // 70, completed
    const c = place(s, "c", "p-iced-americano", 1, at(0, 11)); // 110, pending
    const d = place(s, "d", "p-banana-bread", 1, at(0, 12)); // 60, preparing
    const e = place(s, "e", "p-ensaymada", 1, at(0, 13)); // cancelled
    complete(s, a.id); complete(s, b.id);
    advanceOrder(s, d.id);
    cancelOrder(s, e.id, USER, NOW);
    expect(c.status).toBe("pending");
    const dash = getDashboard(s, NOW);
    expect(dash.date).toBe(today);
    expect(dash.isFallbackDay).toBe(false);
    expect(dash.sales).toBe(290);
    expect(dash.ordersCount).toBe(5);
    expect(dash.openOrdersCount).toBe(2);
    expect(dash.topProducts).toEqual([
      { productName: "Iced Americano", quantity: 2 },
      { productName: "Ensaymada", quantity: 1 },
    ]);
    expect(dash.recentOrders.map((o) => o.id)).toEqual([e.id, d.id, c.id, b.id, a.id]);
  });

  it("counts open orders and recent orders across all days", () => {
    const s = controlled();
    const old = place(s, "old", "p-ensaymada", 1, at(3, 9)); // pending, 3 days ago
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) ids.push(place(s, `t${i}`, "p-banana-bread", 1, at(0, 8 + i)).id);
    for (const id of ids) complete(s, id);
    const dash = getDashboard(s, NOW);
    expect(dash.openOrdersCount).toBe(1); // only the old pending one
    expect(dash.recentOrders.map((o) => o.id)).toEqual([...ids].reverse());
    expect(dash.recentOrders).toHaveLength(6);
    expect(dash.recentOrders.some((o) => o.id === old.id)).toBe(false);
    expect(dash.sales).toBe(360);
  });

  it("limits top products to five by quantity", () => {
    const s = controlled();
    const pids = ["p-iced-americano", "p-ensaymada", "p-banana-bread", "p-salabat", "p-kapeng-barako", "p-tapsilog"];
    pids.forEach((pid, i) => complete(s, place(s, `x${i}`, pid, 6 - i, at(0, 8 + i)).id));
    const top = getDashboard(s, NOW).topProducts;
    expect(top).toHaveLength(5);
    expect(top.map((x) => x.quantity)).toEqual([6, 5, 4, 3, 2]);
  });

  it("falls back to the latest day with orders", () => {
    const s = controlled();
    const old = place(s, "o1", "p-iced-americano", 1, at(5, 9)); // 110
    const newer = place(s, "o2", "p-ensaymada", 3, at(2, 9)); // 210
    const pend = place(s, "o3", "p-ensaymada", 1, at(2, 10)); // pending
    complete(s, old.id); complete(s, newer.id);
    const dash = getDashboard(s, NOW);
    expect(dash.isFallbackDay).toBe(true);
    expect(dash.date).toBe(localDay(at(2, 9).toISOString()));
    expect(dash.sales).toBe(210);
    expect(dash.ordersCount).toBe(2);
    expect(dash.openOrdersCount).toBe(1);
    expect(dash.topProducts).toEqual([{ productName: "Ensaymada", quantity: 3 }]);
    expect(dash.recentOrders.map((o) => o.id)).toEqual([pend.id, newer.id, old.id]);
  });
});
