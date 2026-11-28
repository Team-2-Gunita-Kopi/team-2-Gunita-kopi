import { requireRole } from "@/server/lib/auth";
import { jsonResponse, route } from "@/server/lib/response";
import { readId, readJson } from "@/server/lib/request";
import { CancelOrderItemsRequestSchema } from "@/contracts";
import { cancelOrderItems } from "@/server/modules/orders/service";

type Ctx = { params: Promise<{ id: string }> };

// Cancel chosen items of a pending/preparing order, both roles. Refunds are handled by hand.
export const POST = route(async (req, ctx: Ctx) => {
  const user = await requireRole(req, ["owner_admin", "barista"]);
  const id = await readId(ctx);
  const { items } = await readJson(req, CancelOrderItemsRequestSchema);
  return jsonResponse(await cancelOrderItems(user, id, items));
});
