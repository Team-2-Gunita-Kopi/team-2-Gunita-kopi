import { requireRole } from "@/server/lib/auth";
import { jsonResponse, route } from "@/server/lib/response";
import { readId, readJson } from "@/server/lib/request";
import { UpdateProductRequestSchema } from "@/contracts";
import { deleteProduct, getProduct, updateProduct } from "@/server/modules/products/service";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (req, ctx: Ctx) => {
  const user = await requireRole(req, ["owner_admin", "barista"]);
  return jsonResponse(await getProduct(user, await readId(ctx)));
});

// FR-50, FR-51 (send { isAvailable } to change availability only)
export const PATCH = route(async (req, ctx: Ctx) => {
  const user = await requireRole(req, "owner_admin");
  const id = await readId(ctx);
  const body = await readJson(req, UpdateProductRequestSchema);
  return jsonResponse(await updateProduct(user, id, body));
});

// Owner only: soft delete (see deleteProduct).
export const DELETE = route(async (req, ctx: Ctx) => {
  const user = await requireRole(req, "owner_admin");
  return jsonResponse(await deleteProduct(user, await readId(ctx)));
});
