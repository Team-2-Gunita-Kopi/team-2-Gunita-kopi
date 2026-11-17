import { requireRole } from "@/lib/auth";
import { jsonResponse, route } from "@/lib/response";
import { readId, readJson } from "@/lib/request";
import { UpdateIngredientRequestSchema } from "@gunita/contracts";
import { getIngredient, updateIngredient } from "@/modules/ingredients/service";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (req, ctx: Ctx) => {
  const user = await requireRole(req, ["owner_admin", "barista"]);
  return jsonResponse(await getIngredient(user, await readId(ctx)));
});

// Name, unit, supplier link, reorder level and unit cost. Stock changes only through stock transactions.
export const PATCH = route(async (req, ctx: Ctx) => {
  const user = await requireRole(req, "owner_admin");
  const id = await readId(ctx);
  const body = await readJson(req, UpdateIngredientRequestSchema);
  return jsonResponse(await updateIngredient(user, id, body));
});
