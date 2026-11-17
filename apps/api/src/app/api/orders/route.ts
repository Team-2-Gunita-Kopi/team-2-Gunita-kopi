import { requireRole } from "@/lib/auth";
import { jsonResponse, route } from "@/lib/response";
import { readJson, readQuery } from "@/lib/request";
import {
  CreateOrderRequestSchema,
  OrderListQuerySchema,
} from "@gunita/contracts";
import { checkout, getOrder, listOrders } from "@/modules/orders/service";

// Order board and queue (FR-10), both roles.
export const GET = route(async (req) => {
  const user = await requireRole(req, ["owner_admin", "barista"]);
  return jsonResponse(
    await listOrders(user, readQuery(req, OrderListQuerySchema)),
  );
});

// Online checkout (FR-01 to FR-13). Order entry and payment are Barista functions (SRS 2.3).
// Same atomic database function as POST /api/sync; a repeated clientTxId returns the first order.
export const POST = route(async (req) => {
  const user = await requireRole(req, "barista");
  const body = await readJson(req, CreateOrderRequestSchema);
  const { orderId, duplicate } = await checkout(user, body);
  return jsonResponse(
    { duplicate, order: await getOrder(user, orderId) },
    { status: duplicate ? 200 : 201 },
  );
});
