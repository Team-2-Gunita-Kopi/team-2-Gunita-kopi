import { z } from "zod";

export const SupplierSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
  isActive: z.boolean().default(true),
  createdAt: z.string(),
});
export type Supplier = z.infer<typeof SupplierSchema>;

export const CreateSupplierRequestSchema = z.object({
  name: z.string().min(1),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});
export type CreateSupplierRequest = z.infer<typeof CreateSupplierRequestSchema>;
