import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";
import { errorResponse, notImplementedResponse } from "@/lib/response";
import { listUsers } from "@/modules/users/service";

export async function GET(req: NextRequest) {
  try {
    const user = await requireRole(req, "owner_admin");
    await listUsers(user);
    return notImplementedResponse("GET /api/users");
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "statusCode" in error &&
      (error as { statusCode: number }).statusCode === 501
    ) {
      return notImplementedResponse("GET /api/users");
    }
    return errorResponse(error);
  }
}
