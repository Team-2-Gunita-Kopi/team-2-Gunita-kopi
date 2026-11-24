import { requireRole } from "@/server/lib/auth";
import { jsonResponse, route } from "@/server/lib/response";
import { readJson, readQuery } from "@/server/lib/request";
import {
  CreateSupplierRequestSchema,
  SupplierListQuerySchema,
} from "@/contracts";
import { createSupplier, listSuppliers } from "@/server/modules/suppliers/service";

// FR-22, Owner only
export const GET = route(async (req) => {
  const user = await requireRole(req, "owner_admin");
  return jsonResponse(
    await listSuppliers(user, readQuery(req, SupplierListQuerySchema)),
  );
});

export const POST = route(async (req) => {
  const user = await requireRole(req, "owner_admin");
  const body = await readJson(req, CreateSupplierRequestSchema);
  return jsonResponse(await createSupplier(user, body), { status: 201 });
});
