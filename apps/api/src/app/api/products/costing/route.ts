import { requireRole } from "@/lib/auth";
import { jsonResponse, route } from "@/lib/response";
import { listCostings } from "@/modules/products/service";

// FR-29, Owner only: costing of every product in one request (Products page).
export const GET = route(async (req) => {
  const user = await requireRole(req, "owner_admin");
  return jsonResponse(await listCostings(user));
});
