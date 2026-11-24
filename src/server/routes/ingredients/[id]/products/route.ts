import { requireRole } from "@/server/lib/auth";
import { jsonResponse, route } from "@/server/lib/response";
import { readId } from "@/server/lib/request";
import { listIngredientProducts } from "@/server/modules/ingredients/service";

type Ctx = { params: Promise<{ id: string }> };

// R11, Owner only: the products a delete would take the ingredient out of.
export const GET = route(async (req, ctx: Ctx) => {
  const user = await requireRole(req, "owner_admin");
  return jsonResponse(await listIngredientProducts(user, await readId(ctx)));
});
