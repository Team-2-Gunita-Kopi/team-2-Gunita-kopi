import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";
import { errorResponse, notImplementedResponse } from "@/lib/response";
import { processSyncOrders } from "@/modules/sync/service";
import { SyncPayloadSchema } from "@/modules/sync/schema";

export async function POST(req: NextRequest) {
  try {
    const user = await requireRole(req, "barista");
    const body = await req.json();
    const validated = SyncPayloadSchema.parse(body);

    await processSyncOrders(user, validated);
    return notImplementedResponse("POST /api/sync");
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "statusCode" in error &&
      (error as { statusCode: number }).statusCode === 501
    ) {
      return notImplementedResponse("POST /api/sync");
    }
    return errorResponse(error);
  }
}
