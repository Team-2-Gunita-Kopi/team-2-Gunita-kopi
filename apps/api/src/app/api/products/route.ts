import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";
import { errorResponse, notImplementedResponse } from "@/lib/response";
import { listProducts, createProduct } from "@/modules/products/service";
import { CreateProductRequestSchema } from "@/modules/products/schema";

export async function GET(req: NextRequest) {
  try {
    const user = await requireRole(req, "owner_admin");
    await listProducts(user);
    return notImplementedResponse("GET /api/products");
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "statusCode" in error &&
      (error as { statusCode: number }).statusCode === 501
    ) {
      return notImplementedResponse("GET /api/products");
    }
    return errorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireRole(req, "owner_admin");
    const body = await req.json();
    const validated = CreateProductRequestSchema.parse(body);

    await createProduct(user, validated);
    return notImplementedResponse("POST /api/products");
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "statusCode" in error &&
      (error as { statusCode: number }).statusCode === 501
    ) {
      return notImplementedResponse("POST /api/products");
    }
    return errorResponse(error);
  }
}
