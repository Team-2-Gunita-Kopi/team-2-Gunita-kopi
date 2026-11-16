import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";
import { errorResponse, notImplementedResponse } from "@/lib/response";
import { listSuppliers, createSupplier } from "@/modules/suppliers/service";
import { CreateSupplierRequestSchema } from "@/modules/suppliers/schema";

export async function GET(req: NextRequest) {
  try {
    const user = await requireRole(req, "owner_admin");
    await listSuppliers(user);
    return notImplementedResponse("GET /api/suppliers");
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "statusCode" in error &&
      (error as { statusCode: number }).statusCode === 501
    ) {
      return notImplementedResponse("GET /api/suppliers");
    }
    return errorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireRole(req, "owner_admin");
    const body = await req.json();
    const validated = CreateSupplierRequestSchema.parse(body);

    await createSupplier(user, validated);
    return notImplementedResponse("POST /api/suppliers");
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "statusCode" in error &&
      (error as { statusCode: number }).statusCode === 501
    ) {
      return notImplementedResponse("POST /api/suppliers");
    }
    return errorResponse(error);
  }
}
