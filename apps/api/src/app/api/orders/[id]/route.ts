import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";
import { errorResponse, notImplementedResponse } from "@/lib/response";
import { getOrderById } from "@/modules/orders/service";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await requireRole(req, ["barista", "owner_admin"]);
    await getOrderById(user, id);
    return notImplementedResponse(`GET /api/orders/${id}`);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "statusCode" in error &&
      (error as { statusCode: number }).statusCode === 501
    ) {
      const { id } = await params;
      return notImplementedResponse(`GET /api/orders/${id}`);
    }
    return errorResponse(error);
  }
}
