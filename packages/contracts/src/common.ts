import { z } from "zod";

// Request size caps (zod 3 advisory: oversized collections exhaust memory). Far above real use.
/** Order rows: one per product plus one per add-on, so a big group order can pass 100. */
export const MAX_ORDER_ITEMS = 500;
export const MAX_SYNC_ORDERS = 100;
export const MAX_NOTES_LENGTH = 500;
export const MAX_STATUS_FILTERS = 10;

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

/** Response schema of a paginated list endpoint, for validating API responses in the sites. */
export const pageOf = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  });

export const StatusSchema = z.enum(["active", "inactive"]);
export type Status = z.infer<typeof StatusSchema>;

type PatchShape<S extends z.ZodRawShape> = {
  [K in keyof S]: z.ZodOptional<S[K] extends z.ZodDefault<infer I> ? I : S[K]>;
};

/**
 * PATCH body: every field optional and never defaulted. zod 4's .partial() still fills defaults,
 * so a body like { name } would also reset fields such as isAddon or reorderLevel.
 */
export function patchOf<S extends z.ZodRawShape>(schema: z.ZodObject<S>): z.ZodObject<PatchShape<S>> {
  const shape: Record<string, z.ZodType> = {};
  for (const [key, field] of Object.entries(schema.shape)) {
    const inner = field instanceof z.ZodDefault ? field.unwrap() : field;
    shape[key] = (inner as z.ZodType).optional();
  }
  return z.object(shape) as unknown as z.ZodObject<PatchShape<S>>;
}
