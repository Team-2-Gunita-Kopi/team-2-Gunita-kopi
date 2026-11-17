import type { DashboardStats, OrderStatus, OrderType } from "@gunita/contracts";
import { AuthenticatedUser } from "@/lib/auth";
import { dbError } from "@/lib/errors";
import { manilaDayStart, manilaToday } from "@/lib/dates";
import { bestSellers, stockStatus } from "@/modules/reports/service";

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

  const [sales, completed, pending, preparing, stock, alerts, best, recent] =
    await Promise.all([
      db
        .from("v_daily_sales")
        .select("total_sales")
        .eq("sale_date", today)
        .maybeSingle(),
      countOrders("completed", manilaDayStart(today)),
      countOrders("pending"),
      countOrders("preparing"),
      db.from("v_inventory_status").select("stock_status"),
      stockStatus(user, ["low-stock", "out-of-stock"], 10),
      bestSellers(user, 5),
      db
        .from("v_order_totals")
        .select("*")
        .order("order_id", { ascending: false })
        .limit(10),
    ]);
  for (const r of [sales, completed, pending, preparing, stock, recent]) {
    if (r.error) throw dbError(r.error);
  }

  const byStatus = (s: string) =>
    (stock.data ?? []).filter((r) => r.stock_status === s).length;
  return {
    date: today,
    todaySales: sales.data?.total_sales ?? 0,
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
