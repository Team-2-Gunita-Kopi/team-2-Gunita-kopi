import { z } from "zod";
import {
  IdSchema,
  PaginationQuerySchema,
  StatusSchema,
  optionalText,
  patchOf,
} from "./common";

// SUPPLIERS (FR-22). Reference records only: no purchase orders or automatic reordering.
export const IngredientSupplierOptionSchema = z.object({
  id: IdSchema,
  name: z.string(),
});
export const IngredientSupplierOptionsSchema = z.array(
  IngredientSupplierOptionSchema,
);
export type IngredientSupplierOption = z.infer<
  typeof IngredientSupplierOptionSchema
>;

export const SupplierSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  contactPerson: z.string().nullable(),
  contactNumber: z.string().nullable(),
  address: z.string().nullable(),
  status: StatusSchema,
});
export type Supplier = z.infer<typeof SupplierSchema>;

/** DELETE /api/suppliers/[id]: soft delete; how many ingredients lost the supplier. */
export const DeleteSupplierResponseSchema = z.object({
  id: z.number().int(),
  unlinkedIngredients: z.number().int(),
});
export type DeleteSupplierResponse = z.infer<typeof DeleteSupplierResponseSchema>;

export const CreateSupplierRequestSchema = z.object({
  name: z.string().trim().min(1, "Supplier name is required").max(100),
  contactPerson: optionalText(100),
  contactNumber: optionalText(20),
  address: optionalText(255),
});
export type CreateSupplierRequest = z.infer<typeof CreateSupplierRequestSchema>;

/** Partial update; { status } alone activates or deactivates the supplier. */
export const UpdateSupplierRequestSchema = patchOf(CreateSupplierRequestSchema)
  .extend({ status: StatusSchema.optional() })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");
export type UpdateSupplierRequest = z.infer<typeof UpdateSupplierRequestSchema>;

export const SupplierListQuerySchema = PaginationQuerySchema.extend({
  status: StatusSchema.optional(),
  search: z.string().trim().min(1).max(100).optional(),
});
export type SupplierListQuery = z.infer<typeof SupplierListQuerySchema>;
