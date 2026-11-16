import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";
import { errorResponse, notImplementedResponse } from "@/lib/response";
import { createReceiptDownloadLink } from "@/modules/receipts/service";
import { ReceiptRequestSchema } from "@/modules/receipts/schema";

export async function GET(req: NextRequest) {
  try {
    const user = await requireRole(req, ["barista", "owner_admin"]);
    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get("orderId");
    const validated = ReceiptRequestSchema.parse({ orderId });

    await createReceiptDownloadLink(user, validated);
    return notImplementedResponse("GET /api/receipts");
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "statusCode" in error &&
      (error as { statusCode: number }).statusCode === 501
    ) {
      return notImplementedResponse("GET /api/receipts");
    }
    return errorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireRole(req, ["barista", "owner_admin"]);
    const body = await req.json();
    const validated = ReceiptRequestSchema.parse(body);

    await createReceiptDownloadLink(user, validated);
    return notImplementedResponse("POST /api/receipts");
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "statusCode" in error &&
      (error as { statusCode: number }).statusCode === 501
    ) {
      return notImplementedResponse("POST /api/receipts");
    }
    return errorResponse(error);
  }
}
