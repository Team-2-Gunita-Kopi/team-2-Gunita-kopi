import { requireRole } from "@/lib/auth";
import { jsonResponse, route } from "@/lib/response";
import { readId, readJson } from "@/lib/request";
import { UpdateSupplierRequestSchema } from "@gunita/contracts";
import { getSupplier, updateSupplier } from "@/modules/suppliers/service";

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
