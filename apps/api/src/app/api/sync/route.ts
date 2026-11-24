import { requireRole } from "@/lib/auth";
import { jsonResponse, route } from "@/lib/response";
import { readJson } from "@/lib/request";
import { processSyncOrders } from "@/modules/sync/service";
import { SyncPayloadSchema } from "@/modules/sync/schema";

// Offline outbox sync (FR-57 to FR-60). Per-order results; see SyncResultItem.
export const POST = route(async (req) => {
  const user = await requireRole(req, "barista");
  const body = await readJson(req, SyncPayloadSchema);
  return jsonResponse(await processSyncOrders(user, body));
});
