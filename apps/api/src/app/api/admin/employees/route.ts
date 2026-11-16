import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";
import { errorResponse, notImplementedResponse } from "@/lib/response";
import { createEmployeeAccount } from "@/modules/employees/service";
import { CreateEmployeeRequestSchema } from "@/modules/employees/schema";

export async function POST(req: NextRequest) {
  try {
    const user = await requireRole(req, "owner_admin");
    const body = await req.json();
    const validated = CreateEmployeeRequestSchema.parse(body);

    await createEmployeeAccount(user, validated);
    return notImplementedResponse("POST /api/admin/employees");
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "statusCode" in error &&
      (error as { statusCode: number }).statusCode === 501
    ) {
      return notImplementedResponse("POST /api/admin/employees");
    }
    return errorResponse(error);
  }
}
