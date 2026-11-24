import { z } from "zod";

export const ReportTypeSchema = z.enum([
  "daily",
  "monthly",
  "best-sellers",
  "stock-status",
]);
export type ReportType = z.infer<typeof ReportTypeSchema>;

export const DailyReportSchema = z.object({
  date: z.string(),
  totalSales: z.number().nonnegative(),
  orderCount: z.number().int().nonnegative(),
  averageTicket: z.number().nonnegative(),
  cogs: z.number().nonnegative(),
  grossProfit: z.number(),
});
export type DailyReport = z.infer<typeof DailyReportSchema>;

export const MonthlyReportSchema = z.object({
  month: z.string(),
  totalSales: z.number().nonnegative(),
  orderCount: z.number().int().nonnegative(),
  cogs: z.number().nonnegative(),
  grossProfit: z.number(),
  dailyBreakdown: z.array(DailyReportSchema),
});
export type MonthlyReport = z.infer<typeof MonthlyReportSchema>;

export const BestSellerItemSchema = z.object({
  productId: z.string(),
  productName: z.string(),
  quantitySold: z.number().int().nonnegative(),
  totalRevenue: z.number().nonnegative(),
  profitContribution: z.number(),
});
export type BestSellerItem = z.infer<typeof BestSellerItemSchema>;

export const InventoryStatusItemSchema = z.object({
  ingredientId: z.string(),
  ingredientName: z.string(),
  currentStock: z.number(),
  minimumStock: z.number(),
  unit: z.string(),
  status: z.enum(["ok", "low", "out_of_stock"]),
  unitCost: z.number().nonnegative(),
});
export type InventoryStatusItem = z.infer<typeof InventoryStatusItemSchema>;
