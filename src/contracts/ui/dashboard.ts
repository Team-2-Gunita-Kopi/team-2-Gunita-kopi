import { z } from "zod";
import { OrderSchema } from "./orders";
import { InventoryStatusItemSchema } from "./reports";

export const DashboardStatsSchema = z.object({
  todaySales: z.number().nonnegative(),
  todayOrdersCount: z.number().int().nonnegative(),
  averageOrderValue: z.number().nonnegative(),
  lowStockCount: z.number().int().nonnegative(),
  recentOrdersCount: z.number().int().nonnegative(),
  grossMarginPercent: z.number(),
});
export type DashboardStats = z.infer<typeof DashboardStatsSchema>;

export const OwnerDashboardSchema = z.object({
  date: z.string(),
  isFallbackDay: z.boolean(),
  sales: z.number(),
  ordersCount: z.number(),
  openOrdersCount: z.number(),
  topProducts: z.array(
    z.object({ productName: z.string(), quantity: z.number() }),
  ),
  lowStock: z.array(InventoryStatusItemSchema),
  recentOrders: z.array(OrderSchema),
});
export type OwnerDashboard = z.infer<typeof OwnerDashboardSchema>;
