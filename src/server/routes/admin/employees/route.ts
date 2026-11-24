import { NextRequest } from "next/server";
import { requireRole } from "@/server/lib/auth";
import { errorResponse, jsonResponse } from "@/server/lib/response";
import { readJson } from "@/server/lib/request";
import { createEmployeeAccount } from "@/server/modules/employees/service";
import { CreateEmployeeRequestSchema } from "@/server/modules/employees/schema";

export async function POST(req: NextRequest) {
  try {
    const user = await requireRole(req, "owner_admin");
    const validated = await readJson(req, CreateEmployeeRequestSchema);

    return jsonResponse(await createEmployeeAccount(user, validated), {
      status: 201,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
