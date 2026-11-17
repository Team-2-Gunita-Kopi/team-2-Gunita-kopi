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

// One order row (SDS 3.5.8). Add-on rows carry ingredientId instead of productId.
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
  clientTxId: z.string().uuid("Transaction ID must be a UUID for idempotency"),
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
