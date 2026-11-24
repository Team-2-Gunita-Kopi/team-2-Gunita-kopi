import type {
  CreateSupplierRequest,
  IngredientSupplierOption,
  Page,
  Supplier,
  SupplierListQuery,
  UpdateSupplierRequest,
} from "@gunita/contracts";
import type { Tables } from "@gunita/db-types";
import { AuthenticatedUser } from "@/lib/auth";
import { dbError, NotFoundError } from "@/lib/errors";
import { escapeLike, pageRange, toPage } from "@/lib/request";
import { auditAction } from "@/lib/audit";

const toSupplier = (r: Tables<"suppliers">): Supplier => ({
  id: r.supplier_id,
  name: r.supplier_name,
  contactPerson: r.contact_person,
  contactNumber: r.contact_number,
  address: r.address,
  status: r.status as Supplier["status"],
});

const toRow = (
  d: Partial<CreateSupplierRequest & { status: Supplier["status"] }>,
) => ({
  supplier_name: d.name,
  contact_person: d.contactPerson,
  contact_number: d.contactNumber,
  address: d.address,
  status: d.status,
});

export async function listSuppliers(
  user: AuthenticatedUser,
  q: SupplierListQuery,
): Promise<Page<Supplier>> {
  let query = user.supabaseClient
    .from("suppliers")
    .select("*", { count: "exact" })
    .order("supplier_name")
    .range(...pageRange(q));
  if (q.status) query = query.eq("status", q.status);
  if (q.search) query = query.ilike("supplier_name", `%${escapeLike(q.search)}%`);
  const { data, error, count } = await query;
  if (error) throw dbError(error);
  return toPage(data.map(toSupplier), count, q);
}

/** Baristas may choose an existing active supplier, but cannot read supplier contact details. */
export async function listBaristaSupplierOptions(
  user: AuthenticatedUser,
): Promise<IngredientSupplierOption[]> {
  const { data, error } = await user.supabaseClient.rpc(
    "barista_supplier_options",
  );
  if (error) throw dbError(error);
  return data.map((supplier) => ({
    id: supplier.supplier_id,
    name: supplier.supplier_name,
  }));
}

export async function getSupplier(
  user: AuthenticatedUser,
  id: number,
): Promise<Supplier> {
  const { data, error } = await user.supabaseClient
    .from("suppliers")
    .select("*")
    .eq("supplier_id", id)
    .maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new NotFoundError("Supplier not found");
  return toSupplier(data);
}

export async function createSupplier(
  user: AuthenticatedUser,
  body: CreateSupplierRequest,
): Promise<Supplier> {
  const { data, error } = await user.supabaseClient
    .from("suppliers")
    .insert({ ...toRow(body), supplier_name: body.name, status: "active" })
    .select()
    .single();
  if (error) throw dbError(error);
  await auditAction(
    user,
    "supplier.create",
    "suppliers",
    data.supplier_id,
    body,
  );
  return toSupplier(data);
}

export async function updateSupplier(
  user: AuthenticatedUser,
  id: number,
  body: UpdateSupplierRequest,
): Promise<Supplier> {
  const { data, error } = await user.supabaseClient
    .from("suppliers")
    .update(toRow(body))
    .eq("supplier_id", id)
    .select()
    .maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new NotFoundError("Supplier not found");
  await auditAction(user, "supplier.update", "suppliers", id, body);
  return toSupplier(data);
}
