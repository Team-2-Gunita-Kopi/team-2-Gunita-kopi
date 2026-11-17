import type {
  BestSellerRow,
  Report,
  ReportQuery,
  ReportType,
  StockStatus,
  StockStatusRow,
} from "@gunita/contracts";
import { AuthenticatedUser } from "@/lib/auth";
import { dbError } from "@/lib/errors";

const sum = (values: number[]) =>
  Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100;
const monthStart = (date: string) => `${date.slice(0, 7)}-01`;

/**
 * Owner-only reports (FR-30 to FR-35), computed from the views on every request (nothing stored).
 * The views count completed orders only and use Manila calendar days (v_sales, v_daily_sales, ...).
 */
export async function generateReport(
  user: AuthenticatedUser,
  type: ReportType,
  q: ReportQuery,
): Promise<Report> {
  const db = user.supabaseClient;
  switch (type) {
    case "daily": {
      let query = db
        .from("v_daily_sales")
        .select("*")
        .order("sale_date", { ascending: false })
        .limit(q.limit);
      if (q.from) query = query.gte("sale_date", q.from);
      if (q.to) query = query.lte("sale_date", q.to);
      const { data, error } = await query;
      if (error) throw dbError(error);
      const rows = data.map((r) => ({
        date: r.sale_date ?? "",
        orderCount: r.order_count ?? 0,
        itemsSold: r.items_sold ?? 0,
        totalSales: r.total_sales ?? 0,
      }));
      return {
        type,
        rows,
        totals: {
          orderCount: rows.reduce((a, r) => a + r.orderCount, 0),
          totalSales: sum(rows.map((r) => r.totalSales)),
        },
      };
    }
    case "monthly": {
      let query = db
        .from("v_monthly_sales")
        .select("*")
        .order("sale_month", { ascending: false })
        .limit(q.limit);
      if (q.from) query = query.gte("sale_month", monthStart(q.from));
      if (q.to) query = query.lte("sale_month", monthStart(q.to));
      const { data, error } = await query;
      if (error) throw dbError(error);
      const rows = data.map((r) => ({
        month: r.sale_month ?? "",
        orderCount: r.order_count ?? 0,
        totalSales: r.total_sales ?? 0,
      }));
      return {
        type,
        rows,
        totals: {
          orderCount: rows.reduce((a, r) => a + r.orderCount, 0),
          totalSales: sum(rows.map((r) => r.totalSales)),
        },
      };
    }
    case "best-sellers":
      return { type, rows: await bestSellers(user, q.limit) };
    case "stock-status":
      return { type, rows: await stockStatus(user) };
  }
}

/** FR-34: ranking from completed sales, with the current unit cost from product costing. */
export async function bestSellers(
  user: AuthenticatedUser,
  limit: number,
): Promise<BestSellerRow[]> {
  const { data, error } = await user.supabaseClient
    .from("v_best_sellers")
    .select("*")
    .order("units_sold", { ascending: false })
    .order("product_id")
    .limit(limit);
  if (error) throw dbError(error);
  const ids = data.map((r) => r.product_id);
  const costs = new Map<number, number>();
  if (ids.length > 0) {
    const costing = await user.supabaseClient
      .from("product_costing")
      .select("product_id, total_cost")
      .in("product_id", ids);
    if (costing.error) throw dbError(costing.error);
    for (const c of costing.data)
      if (c.total_cost !== null) costs.set(c.product_id, c.total_cost);
  }
  return data.map((r) => ({
    productId: r.product_id,
    productName: r.product_name,
    unitsSold: r.units_sold ?? 0,
    revenue: r.revenue ?? 0,
    currentUnitCost: costs.get(r.product_id) ?? null,
  }));
}

/** FR-33: every ingredient with its stock status, lowest stock first within each status. */
export async function stockStatus(
  user: AuthenticatedUser,
  statuses?: StockStatus[],
  limit?: number,
): Promise<StockStatusRow[]> {
  let query = user.supabaseClient
    .from("v_inventory_status")
    .select(
      "ingredient_id, ingredient_name, unit, current_stock, reorder_level, stock_status",
    )
    .order("current_stock")
    .order("ingredient_name");
  if (statuses) query = query.in("stock_status", statuses);
  if (limit) query = query.limit(limit);
  const { data, error } = await query;
  if (error) throw dbError(error);
  return data.map((r) => ({
    ingredientId: r.ingredient_id,
    ingredientName: r.ingredient_name,
    unit: r.unit,
    currentStock: r.current_stock,
    reorderLevel: r.reorder_level,
    stockStatus: r.stock_status as StockStatus,
  }));
}
