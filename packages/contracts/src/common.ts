import { z } from "zod";

/** Database id (integer identity column), also accepted as a numeric string in paths and queries. */
export const IdSchema = z.coerce.number().int().positive();

// numeric(10,2): at most 99,999,999.99 and two decimals.
const hasTwoDecimals = (v: number) =>
  Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;
const Numeric10_2 = z
  .number()
  .finite()
  .max(99_999_999.99)
  .refine(hasTwoDecimals, "At most two decimal places");

/** Prices, costs and amounts of money. */
export const MoneySchema = Numeric10_2.refine(
  (v) => v >= 0,
  "Must be 0 or more",
);
/** Stock quantities and recipe amounts that must be above 0. */
export const QuantitySchema = Numeric10_2.refine(
  (v) => v > 0,
  "Must be greater than 0",
);
/** Stock thresholds that may be 0. */
export const NonNegativeQuantitySchema = MoneySchema;

/** Calendar date, YYYY-MM-DD (Asia/Manila business day). */
export const DateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

/** Optional text that may be cleared with null. Empty strings become null. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export const StatusSchema = z.enum(["active", "inactive"]);
export type Status = z.infer<typeof StatusSchema>;
