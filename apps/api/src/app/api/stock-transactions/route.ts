import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";
import { errorResponse, notImplementedResponse } from "@/lib/response";
import {
  listStockTransactions,
  createStockTransaction,
} from "@/modules/stock/service";
import { CreateStockTransactionRequestSchema } from "@/modules/stock/schema";

export async function GET(req: NextRequest) {
  try {
    const user = await requireRole(req, ["barista", "owner_admin"]);
    await listStockTransactions(user);
    return notImplementedResponse("GET /api/stock-transactions");
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "statusCode" in error &&
      (error as { statusCode: number }).statusCode === 501
    ) {
      return notImplementedResponse("GET /api/stock-transactions");
    }
    return errorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireRole(req, ["barista", "owner_admin"]);
    const body = await req.json();
    const validated = CreateStockTransactionRequestSchema.parse(body);

    await createStockTransaction(user, validated);
    return notImplementedResponse("POST /api/stock-transactions");
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "statusCode" in error &&
      (error as { statusCode: number }).statusCode === 501
    ) {
      return notImplementedResponse("POST /api/stock-transactions");
    }
    return errorResponse(error);
  }
}
