import { z } from "zod";
import {
  DateSchema,
  MAX_NOTES_LENGTH,
  MAX_ORDER_ITEMS,
  MAX_STATUS_FILTERS,
  PaginationQuerySchema,
} from "./common";

export const OrderStatusSchema = z.enum([
  "pending",
  "preparing",
  "completed",
  "cancelled",
]);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

// Matches the orders.order_type check. Online/Facebook orders are entered as pre-orders (FR-01).
export const OrderTypeSchema = z.enum(["dine-in", "take-out", "pre-order"]);
export type OrderType = z.infer<typeof OrderTypeSchema>;

// --- Checkout request (POS) ----------------------------------------------------

// One order row (SDS 3.5.8). Add-on rows carry ingredientId instead of productId.
// unitPrice is what the POS showed; the database rechecks it against the current price (FR-58).
export const OrderItemSchema = z
  .object({
    id: z.string().optional(),
    productId: z.string().optional(),
    productName: z.string(),
    isAddon: z.boolean().optional(),
    ingredientId: z.string().optional(),
    quantity: z.number().int().positive(),
    unitPrice: z.number().nonnegative(),
    subtotal: z.number().nonnegative(),
    customization: z.string().max(255).optional(),
    specialInstructions: z.string().max(255).optional(),
    notes: z.string().optional(),
  })
  .refine((i) => (i.isAddon ? !!i.ingredientId : !!i.productId), {
    message: "Add-on rows need ingredientId; product rows need productId",
  });
export type OrderItem = z.infer<typeof OrderItemSchema>;

/**
 * Totals sent by the POS are informational: the database computes the total from current prices.
 * Payment is cash only (FR-06); the API rejects any other paymentMethod.
 */
export const CreateOrderRequestSchema = z.object({
  clientTxId: z.string().uuid("Transaction ID must be a UUID for idempotency"),
  type: OrderTypeSchema,
  items: z
    .array(OrderItemSchema)
    .min(1, "Order must contain at least one item")
    .max(MAX_ORDER_ITEMS),
  totalAmount: z.number().nonnegative(),
  taxAmount: z.number().nonnegative().default(0),
  discountAmount: z.number().nonnegative().default(0),
  paidAmount: z.number().nonnegative(),
  paymentMethod: z.enum(["cash", "card", "qr_code", "other"]),
  notes: z.string().max(MAX_NOTES_LENGTH).optional(),
});
export type CreateOrderRequest = z.infer<typeof CreateOrderRequestSchema>;

// --- Order (receipt, order slip, order board) -------------------------------------

export const OrderLineSchema = z.object({
  lineId: z.number().int(),
  productId: z.number().int().nullable(),
  ingredientId: z.number().int().nullable(),
  isAddon: z.boolean(),
  /** Product name, or the ingredient name for an add-on. */
  name: z.string().nullable(),
  quantity: z.number().int(),
  /** Price at the time of sale. */
  unitPrice: z.number(),
  subtotal: z.number(),
  customization: z.string().nullable(),
  specialInstructions: z.string().nullable(),
});
export type OrderLine = z.infer<typeof OrderLineSchema>;

export const PaymentSchema = z.object({
  amountPaid: z.number(),
  changeAmount: z.number(),
  paymentMethod: z.string(),
  receivedBy: z.number().int().nullable(),
  dateTime: z.string(),
});
export type Payment = z.infer<typeof PaymentSchema>;

export const OrderSchema = z.object({
  /** Also the queue number (FR-04). */
  orderId: z.number().int(),
  clientTxId: z.string(),
  status: OrderStatusSchema,
  orderType: OrderTypeSchema.nullable(),
  orderDate: z.string(),
  cashierId: z.number().int().nullable(),
  /** Null when the caller may not read that user's profile (baristas see only their own). */
  cashierName: z.string().nullable(),
  items: z.array(OrderLineSchema),
  total: z.number(),
  payment: PaymentSchema.nullable(),
});
export type Order = z.infer<typeof OrderSchema>;

/** POST /api/orders result: the saved order, and whether it was a repeat of an earlier request. */
export const CheckoutResultSchema = z.object({
  duplicate: z.boolean(),
  order: OrderSchema,
});
export type CheckoutResult = z.infer<typeof CheckoutResultSchema>;

export const OrderListQuerySchema = PaginationQuerySchema.extend({
  /** One status or a comma list, e.g. "pending,preparing" for the queue. */
  status: z
    .string()
    .transform((v) => v.split(","))
    .pipe(z.array(OrderStatusSchema).min(1).max(MAX_STATUS_FILTERS))
    .optional(),
  from: DateSchema.optional(),
  to: DateSchema.optional(),
});
export type OrderListQuery = z.infer<typeof OrderListQuerySchema>;

export const UpdateOrderStatusRequestSchema = z.object({
  status: OrderStatusSchema,
});
export type UpdateOrderStatusRequest = z.infer<
  typeof UpdateOrderStatusRequestSchema
>;
