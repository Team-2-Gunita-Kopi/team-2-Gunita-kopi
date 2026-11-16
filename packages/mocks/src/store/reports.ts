import { round2, sortByStockUrgency, stockStatus } from "@gunita/contracts";
import type {
  BestSellerItem,
  DailyReport,
  InventoryStatusItem,
  MonthlyReport,
  Order,
  OwnerDashboard,
} from "@gunita/contracts";
import { productUnitCost } from "./catalog";
import { ownerData, type MockState } from "./state";
import { localDay, newestFirst } from "./stock";

/** R13: reports count completed orders only. */
const completed = (state: MockState): Order[] => state.orders.filter((o) => o.status === "completed");

function unitCostById(state: MockState): Map<string, number> {
  return new Map(state.products.map((p) => [p.id, productUnitCost(state, p)]));
}

function cogsOf(orders: Order[], costs: Map<string, number>): number {
  let sum = 0;
  for (const o of orders) for (const it of o.items) sum += (costs.get(it.productId) ?? 0) * it.quantity;
  return round2(sum);
}

function dailyFrom(date: string, orders: Order[], costs: Map<string, number>): DailyReport {
  const totalSales = round2(orders.reduce((s, o) => s + o.totalAmount, 0));
  const cogs = cogsOf(orders, costs);
  return {
    date,
    totalSales,
    orderCount: orders.length,
    averageTicket: orders.length ? round2(totalSales / orders.length) : 0,
    cogs,
    grossProfit: round2(totalSales - cogs),
  };
}

function groupByDay(orders: Order[]): Map<string, Order[]> {
  const m = new Map<string, Order[]>();
  for (const o of orders) {
    const d = localDay(o.createdAt);
    m.set(d, [...(m.get(d) ?? []), o]);
  }
  return m;
}

const ymd = (d: Date) => localDay(d.toISOString());

/** Report window end: `now` if given, else the latest day with any order. */
function anchor(state: MockState, now?: Date): Date {
  if (now) return now;
  const latest = state.orders.map((o) => o.createdAt).sort().pop();
  return latest ? new Date(latest) : new Date(0);
}

/** Last `days` calendar days (ascending, zero-filled), completed orders only. */
export function dailySales(state: MockState, days = 14, now?: Date): DailyReport[] {
  const costs = unitCostById(state);
  const byDay = groupByDay(completed(state));
  const end = anchor(state, now);
  const out: DailyReport[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = ymd(new Date(end.getFullYear(), end.getMonth(), end.getDate() - i, 12));
    out.push(dailyFrom(date, byDay.get(date) ?? [], costs));
  }
  return out;
}

/** Last `months` calendar months (ascending), each with its days that had completed orders. */
export function monthlySales(state: MockState, months = 6, now?: Date): MonthlyReport[] {
  const costs = unitCostById(state);
  const byDay = groupByDay(completed(state));
  const end = anchor(state, now);
  const out: MonthlyReport[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const month = ymd(new Date(end.getFullYear(), end.getMonth() - i, 1, 12)).slice(0, 7);
    const dailyBreakdown = [...byDay.keys()]
      .filter((d) => d.startsWith(month))
      .sort()
      .map((d) => dailyFrom(d, byDay.get(d) ?? [], costs));
    const totalSales = round2(dailyBreakdown.reduce((s, d) => s + d.totalSales, 0));
    const cogs = round2(dailyBreakdown.reduce((s, d) => s + d.cogs, 0));
    out.push({
      month,
      totalSales,
      orderCount: dailyBreakdown.reduce((s, d) => s + d.orderCount, 0),
      cogs,
      grossProfit: round2(totalSales - cogs),
      dailyBreakdown,
    });
  }
  return out;
}

/** Products sold between two local days (inclusive), by quantity descending. */
export function bestSellers(state: MockState, from: string, to: string): BestSellerItem[] {
  const costs = unitCostById(state);
  const acc = new Map<string, BestSellerItem>();
  for (const o of completed(state)) {
    const d = localDay(o.createdAt);
    if (d < from || d > to) continue;
    for (const it of o.items) {
      const row = acc.get(it.productId) ?? {
        productId: it.productId,
        productName: it.productName,
        quantitySold: 0,
        totalRevenue: 0,
        profitContribution: 0,
      };
      row.quantitySold += it.quantity;
      row.totalRevenue = round2(row.totalRevenue + it.subtotal);
      row.profitContribution = round2(row.profitContribution + it.subtotal - (costs.get(it.productId) ?? 0) * it.quantity);
      acc.set(it.productId, row);
    }
  }
  return [...acc.values()].sort((a, b) => b.quantitySold - a.quantitySold || a.productName.localeCompare(b.productName));
}

export function stockStatusReport(state: MockState): InventoryStatusItem[] {
  const { unitCosts } = ownerData(state);
  return sortByStockUrgency(state.ingredients).map((i) => ({
    ingredientId: i.id,
    ingredientName: i.name,
    currentStock: i.currentStock,
    minimumStock: i.minimumStock,
    unit: i.unit,
    status: stockStatus(i.currentStock, i.minimumStock),
    unitCost: unitCosts[i.id] ?? 0,
  }));
}

export function getDashboard(state: MockState, now: Date): OwnerDashboard {
  const today = ymd(now);
  const days = [...new Set(state.orders.map((o) => localDay(o.createdAt)))].sort();
  const hasToday = days.includes(today);
  const date = hasToday ? today : (days.filter((d) => d < today).pop() ?? today);
  const dayOrders = state.orders.filter((o) => localDay(o.createdAt) === date);
  const done = dayOrders.filter((o) => o.status === "completed");

  const qty = new Map<string, number>();
  for (const o of done) for (const it of o.items) qty.set(it.productName, (qty.get(it.productName) ?? 0) + it.quantity);
  const topProducts = [...qty.entries()]
    .map(([productName, quantity]) => ({ productName, quantity }))
    .sort((a, b) => b.quantity - a.quantity || a.productName.localeCompare(b.productName))
    .slice(0, 5);

  return {
    date,
    isFallbackDay: !hasToday && dayOrders.length > 0,
    sales: round2(done.reduce((s, o) => s + o.totalAmount, 0)),
    ordersCount: done.length,
    openOrdersCount: dayOrders.filter((o) => o.status === "pending" || o.status === "preparing").length,
    topProducts,
    lowStock: stockStatusReport(state).filter((i) => i.status !== "ok"),
    recentOrders: newestFirst(dayOrders).slice(0, 6),
  };
}
