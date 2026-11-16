import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";
import { errorResponse, notImplementedResponse } from "@/lib/response";
import {
  getProductRecipe,
  updateProductRecipe,
} from "@/modules/products/service";
import { UpdateRecipeRequestSchema } from "@/modules/products/schema";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await requireRole(req, "owner_admin");
    await getProductRecipe(user, id);
    return notImplementedResponse(`GET /api/products/${id}/recipe`);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "statusCode" in error &&
      (error as { statusCode: number }).statusCode === 501
    ) {
      const { id } = await params;
      return notImplementedResponse(`GET /api/products/${id}/recipe`);
    }
    return errorResponse(error);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await requireRole(req, "owner_admin");
    const body = await req.json();
    const validated = UpdateRecipeRequestSchema.parse(body);

    await updateProductRecipe(user, id, validated);
    return notImplementedResponse(`PUT /api/products/${id}/recipe`);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "statusCode" in error &&
      (error as { statusCode: number }).statusCode === 501
    ) {
      const { id } = await params;
      return notImplementedResponse(`PUT /api/products/${id}/recipe`);
    }
    return errorResponse(error);
  }
}
