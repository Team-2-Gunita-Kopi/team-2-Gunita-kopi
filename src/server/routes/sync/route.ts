import { requireRole } from "@/server/lib/auth";
import { jsonResponse, route } from "@/server/lib/response";
import { readJson } from "@/server/lib/request";
import { processSyncOrders } from "@/server/modules/sync/service";
import { SyncPayloadSchema } from "@/server/modules/sync/schema";

// Offline outbox sync (FR-57 to FR-60). Per-order results; see SyncResultItem.
export const POST = route(async (req) => {
  const user = await requireRole(req, "barista");
  const body = await readJson(req, SyncPayloadSchema);
  return jsonResponse(await processSyncOrders(user, body));
});
