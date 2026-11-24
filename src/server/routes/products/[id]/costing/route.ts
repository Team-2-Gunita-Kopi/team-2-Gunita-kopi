import { requireRole } from "@/server/lib/auth";
import { jsonResponse, route } from "@/server/lib/response";
import { readId, readJson } from "@/server/lib/request";
import { UpdatePackagingCostRequestSchema } from "@/contracts";
import { getCosting, updatePackagingCost } from "@/server/modules/products/service";

type Ctx = { params: Promise<{ id: string }> };

// FR-27 to FR-29, Owner only
export const GET = route(async (req, ctx: Ctx) => {
  const user = await requireRole(req, "owner_admin");
  return jsonResponse(await getCosting(user, await readId(ctx)));
});

// FR-26: packaging cost. Ingredient cost is recalculated by the database on every recipe or unit cost change.
export const PUT = route(async (req, ctx: Ctx) => {
  const user = await requireRole(req, "owner_admin");
  const id = await readId(ctx);
  const body = await readJson(req, UpdatePackagingCostRequestSchema);
  return jsonResponse(await updatePackagingCost(user, id, body));
});
