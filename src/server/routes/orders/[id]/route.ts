import { requireRole } from "@/server/lib/auth";
import { jsonResponse, route } from "@/server/lib/response";
import { readId, readJson } from "@/server/lib/request";
import { UpdateOrderStatusRequestSchema } from "@/contracts";
import { getOrder, updateOrderStatus } from "@/server/modules/orders/service";

type Ctx = { params: Promise<{ id: string }> };

// Full order: receipt and order slip data (FR-08, FR-09). [id] is the order_id (queue number).
export const GET = route(async (req, ctx: Ctx) => {
  const user = await requireRole(req, ["owner_admin", "barista"]);
  return jsonResponse(await getOrder(user, await readId(ctx)));
});

// Status change (FR-10), both roles. Invalid transitions answer 409 INVALID_TRANSITION.
export const PATCH = route(async (req, ctx: Ctx) => {
  const user = await requireRole(req, ["owner_admin", "barista"]);
  const id = await readId(ctx);
  const { status } = await readJson(req, UpdateOrderStatusRequestSchema);
  return jsonResponse(await updateOrderStatus(user, id, status));
});
