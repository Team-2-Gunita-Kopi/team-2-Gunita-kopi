import type {
  BestSellerRow,
  Report,
  ReportQuery,
  ReportType,
  StockStatus,
  StockStatusRow,
} from "@/contracts";
import { AuthenticatedUser } from "@/server/lib/auth";
import { dbError } from "@/server/lib/errors";
import { manilaDayStart, manilaNextDayStart } from "@/server/lib/dates";

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
      return {
        type,
        rows: await bestSellers(user, q.limit, q.from, q.to),
      };
    case "stock-status":
      return { type, rows: await stockStatus(user) };
  }
}

/** Current unit cost per product (product_costing.total_cost), for the given ids. */
async function costsFor(
  user: AuthenticatedUser,
  ids: number[],
): Promise<Map<number, number>> {
  const costs = new Map<number, number>();
  if (ids.length === 0) return costs;
  const costing = await user.supabaseClient
    .from("product_costing")
    .select("product_id, total_cost")
    .in("product_id", ids);
  if (costing.error) throw dbError(costing.error);
  for (const c of costing.data)
    if (c.total_cost !== null) costs.set(c.product_id, c.total_cost);
  return costs;
}

/** FR-34: completed-sales ranking, optionally filtered to inclusive Manila dates. */
export async function bestSellers(
  user: AuthenticatedUser,
  limit: number,
  from?: string,
  to?: string,
): Promise<BestSellerRow[]> {
  const ranked: Omit<BestSellerRow, "currentUnitCost">[] = [];

  if (!from && !to) {
    const { data, error } = await user.supabaseClient
      .from("v_best_sellers")
      .select("*")
      .order("units_sold", { ascending: false })
      .order("product_id")
      .limit(limit);
    if (error) throw dbError(error);
    ranked.push(
      ...data.map((row) => ({
        productId: row.product_id,
        productName: row.product_name,
        unitsSold: row.units_sold ?? 0,
        revenue: row.revenue ?? 0,
      })),
    );
  } else {
    const totals = new Map<number, { unitsSold: number; revenue: number }>();
    const pageSize = 1000;
    let offset = 0;

    while (true) {
      let query = user.supabaseClient
        .from("v_sales")
        .select("order_line_id, product_id, quantity, subtotal")
        .eq("is_addon", false)
        .order("order_line_id")
        .range(offset, offset + pageSize - 1);
      if (from) query = query.gte("order_date", manilaDayStart(from));
      if (to) query = query.lt("order_date", manilaNextDayStart(to));
      const { data, error } = await query;
      if (error) throw dbError(error);

      for (const sale of data) {
        if (sale.product_id === null) continue;
        const total = totals.get(sale.product_id) ?? {
          unitsSold: 0,
          revenue: 0,
        };
        total.unitsSold += sale.quantity;
        total.revenue += sale.subtotal;
        totals.set(sale.product_id, total);
      }

      if (data.length < pageSize) break;
      offset += pageSize;
    }

    // Speed: rank by units first (names are not needed for that), then load names and costs for
    // the top rows only, in parallel.
    const top = [...totals.entries()]
      .sort(([idA, a], [idB, b]) => b.unitsSold - a.unitsSold || idA - idB)
      .slice(0, limit);
    const topIds = top.map(([productId]) => productId);
    if (topIds.length === 0) return [];
    const [products, costing] = await Promise.all([
      user.supabaseClient
        .from("products")
        .select("product_id, product_name")
        .in("product_id", topIds),
      costsFor(user, topIds),
    ]);
    if (products.error) throw dbError(products.error);
    const names = new Map(products.data.map((p) => [p.product_id, p.product_name]));
    return top.map(([productId, total]) => {
      const productName = names.get(productId);
      if (productName === undefined) {
        throw new Error(`Product ${productId} is missing from the best-sellers report.`);
      }
      return {
        productId,
        productName,
        unitsSold: total.unitsSold,
        revenue: Math.round(total.revenue * 100) / 100,
        currentUnitCost: costing.get(productId) ?? null,
      };
    });
  }

  const costs = await costsFor(user, ranked.map((row) => row.productId));
  return ranked.map((row) => ({
    ...row,
    currentUnitCost: costs.get(row.productId) ?? null,
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
