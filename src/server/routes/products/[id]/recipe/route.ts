import { requireRole } from "@/server/lib/auth";
import { jsonResponse, route } from "@/server/lib/response";
import { readId, readJson } from "@/server/lib/request";
import { UpdateRecipeRequestSchema } from "@/contracts";
import { getRecipe, updateRecipe } from "@/server/modules/products/service";

type Ctx = { params: Promise<{ id: string }> };

// FR-23, Owner only
export const GET = route(async (req, ctx: Ctx) => {
  const user = await requireRole(req, "owner_admin");
  return jsonResponse(await getRecipe(user, await readId(ctx)));
});

// Replaces the whole recipe atomically: add, change and remove lines in one request.
export const PUT = route(async (req, ctx: Ctx) => {
  const user = await requireRole(req, "owner_admin");
  const id = await readId(ctx);
  const body = await readJson(req, UpdateRecipeRequestSchema);
  return jsonResponse(await updateRecipe(user, id, body));
});
