import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";
import { errorResponse, notImplementedResponse } from "@/lib/response";
import { listOrders, createOrder } from "@/modules/orders/service";
import { CreateOrderRequestSchema } from "@/modules/orders/schema";

export async function GET(req: NextRequest) {
  try {
    const user = await requireRole(req, ["barista", "owner_admin"]);
    await listOrders(user);
    return notImplementedResponse("GET /api/orders");
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "statusCode" in error &&
      (error as { statusCode: number }).statusCode === 501
    ) {
      return notImplementedResponse("GET /api/orders");
    }
    return errorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireRole(req, ["barista", "owner_admin"]);
    const body = await req.json();
    const validated = CreateOrderRequestSchema.parse(body);

    await createOrder(user, validated);
    return notImplementedResponse("POST /api/orders");
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "statusCode" in error &&
      (error as { statusCode: number }).statusCode === 501
    ) {
      return notImplementedResponse("POST /api/orders");
    }
    return errorResponse(error);
  }
}
