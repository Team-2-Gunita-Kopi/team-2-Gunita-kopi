import { requireRole } from "@/lib/auth";
import { jsonResponse, route } from "@/lib/response";
import { readJson, readQuery } from "@/lib/request";
import {
  CreateIngredientRequestSchema,
  IngredientListQuerySchema,
} from "@gunita/contracts";
import {
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

// FR-21, Owner only (the SRS gives ingredient management to the Owner/Manager).
export const POST = route(async (req) => {
  const user = await requireRole(req, "owner_admin");
  const body = await readJson(req, CreateIngredientRequestSchema);
  return jsonResponse(await createIngredient(user, body), { status: 201 });
});
