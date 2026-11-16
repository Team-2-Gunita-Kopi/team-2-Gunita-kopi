import { CreateSupplierRequest, Supplier } from "./schema";
import { AuthenticatedUser } from "@/lib/auth";
import { NotImplementedError } from "@/lib/errors";

export async function listSuppliers(
  _user: AuthenticatedUser,
): Promise<Supplier[]> {
  // TODO: Query suppliers via user.supabaseClient
  throw new NotImplementedError(
    "List suppliers service is not implemented yet.",
  );
}

export async function createSupplier(
  _user: AuthenticatedUser,
  _data: CreateSupplierRequest,
): Promise<Supplier> {
  // TODO: Insert into suppliers table via user.supabaseClient
  throw new NotImplementedError(
    "Create supplier service is not implemented yet.",
  );
}
