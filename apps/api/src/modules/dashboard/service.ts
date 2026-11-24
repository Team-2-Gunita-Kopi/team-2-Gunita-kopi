import type {
  BestSellerRow,
  DashboardStats,
  OrderStatus,
  OrderType,
} from "@gunita/contracts";
import { AuthenticatedUser } from "@/lib/auth";
import { dbError } from "@/lib/errors";
import {
  manilaDayStart,
  manilaNextDayStart,
  manilaToday,
} from "@/lib/dates";
import { stockStatus } from "@/modules/reports/service";

async function bestSellersToday(
  user: AuthenticatedUser,
  today: string,
): Promise<BestSellerRow[]> {
  // Speed: product names come with the lines (one query). Pages of 1000 keep busy days complete
  // under PostgREST's row cap; a normal day is a single page.
  const totals = new Map<number, { unitsSold: number; revenue: number }>();
  const names = new Map<number, string>();
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data: lines, error: linesError } = await user.supabaseClient
      .from("orders")
      .select("order_line_id, product_id, quantity, subtotal, products(product_name)")
      .eq("status", "completed")
      .eq("is_addon", false)
      .gte("order_date", manilaDayStart(today))
      .lt("order_date", manilaNextDayStart(today))
      .not("product_id", "is", null)
      .order("order_line_id")
      .range(offset, offset + pageSize - 1);
    if (linesError) throw dbError(linesError);
    for (const line of lines) {
      if (line.product_id === null) continue;
      const total = totals.get(line.product_id) ?? { unitsSold: 0, revenue: 0 };
      total.unitsSold += line.quantity;
      total.revenue += line.subtotal;
      totals.set(line.product_id, total);
      const name = (line.products as { product_name: string } | null)?.product_name;
      if (name) names.set(line.product_id, name);
    }
    if (lines.length < pageSize) break;
  }

  const productIds = [...totals.keys()];
  if (productIds.length === 0) return [];
  return productIds
    .map((productId) => ({
      productId,
      productName: names.get(productId) ?? `Product ${productId}`,
      unitsSold: totals.get(productId)!.unitsSold,
      revenue: totals.get(productId)!.revenue,
      currentUnitCost: null,
    }))
    .sort((a, b) => b.unitsSold - a.unitsSold || a.productName.localeCompare(b.productName))
    .slice(0, 5);
}

/**
 * Owner dashboard (FR-36 to FR-39), all derived from live data. Staff on duty (FR-40) is not
 * returned: there is no attendance or shift data (attendance is out of scope, SRS section 8).
 */
export async function getDashboardStats(
  user: AuthenticatedUser,
): Promise<DashboardStats> {
  const db = user.supabaseClient;
  const today = manilaToday();
  const countOrders = (status: OrderStatus, since?: string) => {
    let q = db
      .from("v_order_totals")
      .select("order_id", { count: "exact", head: true })
      .eq("status", status);
    if (since) q = q.gte("order_date", since);
    return q;
  };

  const [sales, completed, todayOrders, pending, preparing, stock, alerts, best, recent] =
    await Promise.all([
      db
        .from("v_daily_sales")
        .select("total_sales")
        .eq("sale_date", today)
        .maybeSingle(),
      countOrders("completed", manilaDayStart(today)),
      db
        .from("v_order_totals")
        .select("order_id", { count: "exact", head: true })
        .gte("order_date", manilaDayStart(today))
        .lt("order_date", manilaNextDayStart(today)),
      countOrders("pending"),
      countOrders("preparing"),
      db.from("v_inventory_status").select("stock_status"),
      stockStatus(user, ["low-stock", "out-of-stock"], 10),
      bestSellersToday(user, today),
      db
        .from("v_order_totals")
        .select("*")
        .order("order_id", { ascending: false })
        .limit(4),
    ]);
  for (const r of [sales, completed, todayOrders, pending, preparing, stock, recent]) {
    if (r.error) throw dbError(r.error);
  }

  const byStatus = (s: string) =>
    (stock.data ?? []).filter((r) => r.stock_status === s).length;
  return {
    date: today,
    todaySales: sales.data?.total_sales ?? 0,
    todayOrdersCount: todayOrders.count ?? 0,
    todayCompletedOrders: completed.count ?? 0,
    pendingOrders: pending.count ?? 0,
    preparingOrders: preparing.count ?? 0,
    stock: {
      available: byStatus("available"),
      lowStock: byStatus("low-stock"),
      outOfStock: byStatus("out-of-stock"),
    },
    stockAlerts: alerts,
    bestSellers: best,
    recentOrders: (recent.data ?? []).map((r) => ({
      orderId: r.order_id,
      orderDate: r.order_date ?? "",
      orderType: r.order_type as OrderType | null,
      status: r.status as OrderStatus,
      itemCount: r.item_count ?? 0,
      total: r.total ?? 0,
    })),
  };
}
