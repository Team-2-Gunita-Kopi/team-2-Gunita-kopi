import {
  SupplierSchema,
  pageOf,
  type CreateSupplierRequest,
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
