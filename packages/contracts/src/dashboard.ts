import { z } from "zod";

export const DashboardStatsSchema = z.object({
  todaySales: z.number().nonnegative(),
  todayOrdersCount: z.number().int().nonnegative(),
  averageOrderValue: z.number().nonnegative(),
  lowStockCount: z.number().int().nonnegative(),
  recentOrdersCount: z.number().int().nonnegative(),
  grossMarginPercent: z.number(),
});
export type DashboardStats = z.infer<typeof DashboardStatsSchema>;
