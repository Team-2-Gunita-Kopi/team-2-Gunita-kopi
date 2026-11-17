import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";
import { errorResponse, jsonResponse } from "@/lib/response";
import { processSyncOrders } from "@/modules/sync/service";
import { SyncPayloadSchema } from "@/modules/sync/schema";

export async function POST(req: NextRequest) {
  try {
    const user = await requireRole(req, "barista");
    const body = await req.json();
    const validated = SyncPayloadSchema.parse(body);

    return jsonResponse(await processSyncOrders(user, validated));
  } catch (error) {
    return errorResponse(error);
  }
}
