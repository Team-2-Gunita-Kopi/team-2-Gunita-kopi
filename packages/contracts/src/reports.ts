import { z } from "zod";
import { DateSchema } from "./common";
import { StockStatusSchema } from "./ingredients";

// Owner-only reports (FR-30 to FR-35), read from the database views. Sales count completed orders only.
export const ReportTypeSchema = z.enum([
  "daily",
  "monthly",
  "best-sellers",
  "stock-status",
]);
export type ReportType = z.infer<typeof ReportTypeSchema>;

/**
 * daily: from/to filter sale dates. monthly: from/to filter the month (any day in it).
 * best-sellers: all-time ranking; limit caps the rows. stock-status: current stock, no dates.
 */
export const ReportQuerySchema = z.object({
  from: DateSchema.optional(),
  to: DateSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
export type ReportQuery = z.infer<typeof ReportQuerySchema>;

export const DailySalesRowSchema = z.object({
  date: z.string(),
  orderCount: z.number().int(),
  itemsSold: z.number(),
  totalSales: z.number(),
});
export type DailySalesRow = z.infer<typeof DailySalesRowSchema>;

export const MonthlySalesRowSchema = z.object({
  /** First day of the month, YYYY-MM-DD. */
  month: z.string(),
  orderCount: z.number().int(),
  totalSales: z.number(),
});
export type MonthlySalesRow = z.infer<typeof MonthlySalesRowSchema>;

export const BestSellerRowSchema = z.object({
  productId: z.number().int(),
  productName: z.string(),
  unitsSold: z.number(),
  revenue: z.number(),
  /** Current total cost per unit from product costing (not the cost at the time of sale); null if not costed. */
  currentUnitCost: z.number().nullable(),
});
export type BestSellerRow = z.infer<typeof BestSellerRowSchema>;

export const StockStatusRowSchema = z.object({
  ingredientId: z.number().int(),
  ingredientName: z.string(),
  unit: z.string().nullable(),
  currentStock: z.number(),
  reorderLevel: z.number(),
  stockStatus: StockStatusSchema,
});
export type StockStatusRow = z.infer<typeof StockStatusRowSchema>;

export type Report =
  | {
      type: "daily";
      rows: DailySalesRow[];
      totals: { orderCount: number; totalSales: number };
    }
  | {
      type: "monthly";
      rows: MonthlySalesRow[];
      totals: { orderCount: number; totalSales: number };
    }
  | { type: "best-sellers"; rows: BestSellerRow[] }
  | { type: "stock-status"; rows: StockStatusRow[] };
