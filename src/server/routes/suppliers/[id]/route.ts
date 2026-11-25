import { requireRole } from "@/server/lib/auth";
import { jsonResponse, route } from "@/server/lib/response";
import { readId, readJson } from "@/server/lib/request";
import { UpdateSupplierRequestSchema } from "@/contracts";
import { deleteSupplier, getSupplier, updateSupplier } from "@/server/modules/suppliers/service";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (req, ctx: Ctx) => {
  const user = await requireRole(req, "owner_admin");
  return jsonResponse(await getSupplier(user, await readId(ctx)));
});

// Send { status } to activate or deactivate.
export const PATCH = route(async (req, ctx: Ctx) => {
  const user = await requireRole(req, "owner_admin");
  const id = await readId(ctx);
  const body = await readJson(req, UpdateSupplierRequestSchema);
  return jsonResponse(await updateSupplier(user, id, body));
});

// Owner only: soft delete (see deleteSupplier).
export const DELETE = route(async (req, ctx: Ctx) => {
  const user = await requireRole(req, "owner_admin");
  return jsonResponse(await deleteSupplier(user, await readId(ctx)));
});
