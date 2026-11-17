import { requireRole } from "@/lib/auth";
import { jsonResponse, route } from "@/lib/response";
import { readId, readJson } from "@/lib/request";
import { UpdatePackagingCostRequestSchema } from "@gunita/contracts";
import { getCosting, updatePackagingCost } from "@/modules/products/service";

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
