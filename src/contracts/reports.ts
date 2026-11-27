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
 * best-sellers: completed-sales ranking with optional inclusive date filters; limit caps the rows.
 * stock-status: current stock, no dates.
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

const ReportTotalsSchema = z.object({ orderCount: z.number(), totalSales: z.number() });

/**
 * POST /api/reports/[type]: the Owner prepares the shown report for printing. The body holds only the
 * filters as shown and the number of printed rows; who prepared it comes from the session.
 */
export const ReportPrintRequestSchema = z.object({
  parameters: z
    .record(z.string().max(60), z.string().max(200))
    .refine((p) => Object.keys(p).length <= 12, "Too many report parameters"),
  recordCount: z.number().int().min(0).max(100_000),
});
export type ReportPrintRequest = z.infer<typeof ReportPrintRequestSchema>;

export const ReportPrintInfoSchema = z.object({
  reportId: z.string(),
  /** ISO timestamp set by the server. */
  preparedAt: z.string(),
  preparedBy: z.object({ fullName: z.string(), username: z.string(), role: z.string() }),
  /** Full name of the active Owner account, for the approval block; null if none is found. */
  ownerName: z.string().nullable(),
});
export type ReportPrintInfo = z.infer<typeof ReportPrintInfoSchema>;

/** Response of GET /api/reports/[type], for validating it in the Admin site. */
export const ReportSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("daily"), rows: z.array(DailySalesRowSchema), totals: ReportTotalsSchema }),
  z.object({ type: z.literal("monthly"), rows: z.array(MonthlySalesRowSchema), totals: ReportTotalsSchema }),
  z.object({ type: z.literal("best-sellers"), rows: z.array(BestSellerRowSchema) }),
  z.object({ type: z.literal("stock-status"), rows: z.array(StockStatusRowSchema) }),
]);
