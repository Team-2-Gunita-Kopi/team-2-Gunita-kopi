import {
  DeleteSupplierResponseSchema,
  SupplierSchema,
  pageOf,
  type CreateSupplierRequest,
  type DeleteSupplierResponse,
  type Supplier,
  type UpdateSupplierRequest,
} from "@/contracts";
import { apiAllPages, apiData } from "@/owner/lib/api-client";

// FR-22: suppliers (Owner only).
export const listSuppliers = (): Promise<Supplier[]> =>
  apiAllPages("/api/suppliers", pageOf(SupplierSchema));

export const createSupplier = (body: CreateSupplierRequest): Promise<Supplier> =>
  apiData("/api/suppliers", SupplierSchema, { method: "POST", body: JSON.stringify(body) });

export const updateSupplier = (id: number, body: UpdateSupplierRequest): Promise<Supplier> =>
  apiData(`/api/suppliers/${id}`, SupplierSchema, { method: "PATCH", body: JSON.stringify(body) });

/** Soft delete; its ingredients lose the supplier link. */
export const deleteSupplier = (id: number): Promise<DeleteSupplierResponse> =>
  apiData(`/api/suppliers/${id}`, DeleteSupplierResponseSchema, { method: "DELETE" });
