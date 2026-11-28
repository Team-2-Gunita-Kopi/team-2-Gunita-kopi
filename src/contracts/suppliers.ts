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

/** Philippine regions offered for a supplier address (18, with the Negros Island Region). */
export const PH_REGIONS = [
  "NCR (National Capital Region)",
  "CAR (Cordillera Administrative Region)",
  "Region I (Ilocos Region)",
  "Region II (Cagayan Valley)",
  "Region III (Central Luzon)",
  "Region IV-A (CALABARZON)",
  "MIMAROPA (Region IV-B)",
  "Region V (Bicol Region)",
  "Region VI (Western Visayas)",
  "NIR (Negros Island Region)",
  "Region VII (Central Visayas)",
  "Region VIII (Eastern Visayas)",
  "Region IX (Zamboanga Peninsula)",
  "Region X (Northern Mindanao)",
  "Region XI (Davao Region)",
  "Region XII (SOCCSKSARGEN)",
  "Region XIII (Caraga)",
  "BARMM (Bangsamoro Autonomous Region in Muslim Mindanao)",
] as const;

export const SupplierSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  contactPerson: z.string().nullable(),
  contactNumber: z.string().nullable(),
  /** Old one-line address of suppliers saved before the address fields; null once they are filled. */
  address: z.string().nullable(),
  street: z.string().nullable(),
  barangay: z.string().nullable(),
  city: z.string().nullable(),
  province: z.string().nullable(),
  zipCode: z.string().nullable(),
  region: z.string().nullable(),
  status: StatusSchema,
});
export type Supplier = z.infer<typeof SupplierSchema>;

/** DELETE /api/suppliers/[id]: soft delete; how many ingredients lost the supplier. */
export const DeleteSupplierResponseSchema = z.object({
  id: z.number().int(),
  unlinkedIngredients: z.number().int(),
});
export type DeleteSupplierResponse = z.infer<typeof DeleteSupplierResponseSchema>;

const requiredText = (label: string, max: number) =>
  z.string().trim().min(1, `${label} is required`).max(max);

/** Every address field is required, so suppliers can be searched and filtered by place. */
export const CreateSupplierRequestSchema = z.object({
  name: z.string().trim().min(1, "Supplier name is required").max(100),
  contactPerson: optionalText(100),
  contactNumber: optionalText(20),
  street: requiredText("Street", 150),
  barangay: requiredText("Barangay", 100),
  city: requiredText("City / Municipality", 100),
  province: requiredText("Province", 100),
  zipCode: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "ZIP code must be 4 digits"),
  region: z.enum(PH_REGIONS, { message: "Choose a region" }),
});
export type CreateSupplierRequest = z.infer<typeof CreateSupplierRequestSchema>;

const ADDRESS_KEYS = [
  "street",
  "barangay",
  "city",
  "province",
  "zipCode",
  "region",
] as const;

/**
 * Partial update; { status } alone activates or deactivates the supplier. The address is sent
 * whole: all six fields or none.
 */
export const UpdateSupplierRequestSchema = patchOf(CreateSupplierRequestSchema)
  .extend({ status: StatusSchema.optional() })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update")
  .refine((v) => {
    const sent = ADDRESS_KEYS.filter((k) => v[k] !== undefined).length;
    return sent === 0 || sent === ADDRESS_KEYS.length;
  }, "Send every address field: street, barangay, city, province, ZIP code and region");
export type UpdateSupplierRequest = z.infer<typeof UpdateSupplierRequestSchema>;

export const SupplierListQuerySchema = PaginationQuerySchema.extend({
  status: StatusSchema.optional(),
  search: z.string().trim().min(1).max(100).optional(),
});
export type SupplierListQuery = z.infer<typeof SupplierListQuerySchema>;
