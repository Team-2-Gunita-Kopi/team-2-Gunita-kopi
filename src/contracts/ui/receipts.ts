import { z } from "zod";

export const ReceiptRequestSchema = z.object({
  orderId: z.string().min(1),
});
export type ReceiptRequest = z.infer<typeof ReceiptRequestSchema>;

export const ReceiptResponseSchema = z.object({
  orderId: z.string(),
  downloadUrl: z.string().url(),
  expiresAt: z.string(),
  filename: z.string(),
});
export type ReceiptResponse = z.infer<typeof ReceiptResponseSchema>;
