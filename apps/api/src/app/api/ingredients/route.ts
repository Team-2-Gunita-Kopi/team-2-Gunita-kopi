import { requireRole } from "@/lib/auth";
import { jsonResponse, route } from "@/lib/response";
import { readJson, readQuery } from "@/lib/request";
import {
  CreateBaristaIngredientRequestSchema,
  CreateIngredientRequestSchema,
  IngredientListQuerySchema,
} from "@gunita/contracts";
import {
  createBaristaIngredient,
  createIngredient,
  listIngredients,
} from "@/modules/ingredients/service";

// FR-14: inventory and stock status for both roles.
export const GET = route(async (req) => {
  const user = await requireRole(req, ["owner_admin", "barista"]);
  return jsonResponse(
    await listIngredients(user, readQuery(req, IngredientListQuerySchema)),
  );
});

// Baristas can create basic ingredients through a restricted RPC; supplier, cost, add-on settings,
// and ingredient edits remain Owner-only.
export const POST = route(async (req) => {
  const user = await requireRole(req, ["owner_admin", "barista"]);
  if (user.role === "barista") {
    const body = await readJson(req, CreateBaristaIngredientRequestSchema);
    return jsonResponse(await createBaristaIngredient(user, body), {
      status: 201,
    });
  }
  const body = await readJson(req, CreateIngredientRequestSchema);
  return jsonResponse(await createIngredient(user, body), { status: 201 });
});
