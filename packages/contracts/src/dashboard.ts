import { z } from "zod";
import { BestSellerRowSchema, StockStatusRowSchema } from "./reports";
import { OrderStatusSchema, OrderTypeSchema } from "./orders";

export const OrderSummarySchema = z.object({
  orderId: z.number().int(),
  orderDate: z.string(),
  orderType: OrderTypeSchema.nullable(),
  status: OrderStatusSchema,
  itemCount: z.number().int(),
  total: z.number(),
});
export type OrderSummary = z.infer<typeof OrderSummarySchema>;

/**
 * Owner dashboard (FR-36 to FR-39). "Staff on duty" (FR-40) is not included: the data model has
 * no attendance or shift records, and attendance is out of scope (SRS section 8).
 */
export const DashboardStatsSchema = z.object({
  /** Business day (Asia/Manila), YYYY-MM-DD. */
  date: z.string(),
  todaySales: z.number(),
  todayCompletedOrders: z.number().int(),
  /** Current queue, any date. */
  pendingOrders: z.number().int(),
  preparingOrders: z.number().int(),
  stock: z.object({
    available: z.number().int(),
    lowStock: z.number().int(),
    outOfStock: z.number().int(),
  }),
  /** Low-stock and out-of-stock ingredients, lowest first (max 10). */
  stockAlerts: z.array(StockStatusRowSchema),
  bestSellers: z.array(BestSellerRowSchema),
  recentOrders: z.array(OrderSummarySchema),
});
export type DashboardStats = z.infer<typeof DashboardStatsSchema>;
