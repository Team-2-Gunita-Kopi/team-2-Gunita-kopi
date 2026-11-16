import { z } from "zod";

export const OrderStatusSchema = z.enum([
  "pending",
  "preparing",
  "completed",
  "cancelled",
]);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

export const OrderTypeSchema = z.enum([
  "dine-in",
  "take-out",
  "online",
  "pre-order",
]);
export type OrderType = z.infer<typeof OrderTypeSchema>;

export const OrderItemSchema = z.object({
  id: z.string().optional(),
  productId: z.string(),
  productName: z.string(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
  subtotal: z.number().nonnegative(),
  notes: z.string().optional(),
});
export type OrderItem = z.infer<typeof OrderItemSchema>;

export const OrderSchema = z.object({
  id: z.string(),
  clientTxId: z.string(),
  orderNumber: z.string().optional(),
  status: OrderStatusSchema,
  type: OrderTypeSchema,
  items: z.array(OrderItemSchema),
  totalAmount: z.number().nonnegative(),
  taxAmount: z.number().nonnegative().default(0),
  discountAmount: z.number().nonnegative().default(0),
  paidAmount: z.number().nonnegative(),
  changeAmount: z.number().nonnegative().default(0),
  paymentMethod: z.enum(["cash", "card", "qr_code", "other"]),
  createdAt: z.string(),
  createdBy: z.string(),
  notes: z.string().optional(),
});
export type Order = z.infer<typeof OrderSchema>;

export const CreateOrderRequestSchema = z.object({
  clientTxId: z.string().min(1, "Transaction ID is required for idempotency"),
  type: OrderTypeSchema,
  items: z
    .array(OrderItemSchema)
    .min(1, "Order must contain at least one item"),
  totalAmount: z.number().nonnegative(),
  taxAmount: z.number().nonnegative().default(0),
  discountAmount: z.number().nonnegative().default(0),
  paidAmount: z.number().nonnegative(),
  paymentMethod: z.enum(["cash", "card", "qr_code", "other"]),
  notes: z.string().optional(),
});
export type CreateOrderRequest = z.infer<typeof CreateOrderRequestSchema>;
