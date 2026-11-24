import { requireRole } from "@/server/lib/auth";
import { jsonResponse, route } from "@/server/lib/response";
import { readId, readJson } from "@/server/lib/request";
import { UpdateIngredientRequestSchema } from "@/contracts";
import { deleteIngredient, getIngredient, updateIngredient } from "@/server/modules/ingredients/service";

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

// Owner only: soft delete (see deleteIngredient).
export const DELETE = route(async (req, ctx: Ctx) => {
  const user = await requireRole(req, "owner_admin");
  return jsonResponse(await deleteIngredient(user, await readId(ctx)));
});
