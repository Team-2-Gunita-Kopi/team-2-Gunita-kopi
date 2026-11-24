import { requireRole } from "@/lib/auth";
import { jsonResponse, route } from "@/lib/response";
import { readId, readJson } from "@/lib/request";
import { UpdateProductRequestSchema } from "@gunita/contracts";
import { getProduct, updateProduct } from "@/modules/products/service";

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
