import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";
import { errorResponse, jsonResponse } from "@/lib/response";
import { readJson } from "@/lib/request";
import { createEmployeeAccount } from "@/modules/employees/service";
import { CreateEmployeeRequestSchema } from "@/modules/employees/schema";

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
