import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";
import { errorResponse, notImplementedResponse } from "@/lib/response";
import { getDashboardStats } from "@/modules/dashboard/service";

export async function GET(req: NextRequest) {
  try {
    const user = await requireRole(req, "owner_admin");
    await getDashboardStats(user);
    return notImplementedResponse("GET /api/dashboard");
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "statusCode" in error &&
      (error as { statusCode: number }).statusCode === 501
    ) {
      return notImplementedResponse("GET /api/dashboard");
    }
    return errorResponse(error);
  }
}
