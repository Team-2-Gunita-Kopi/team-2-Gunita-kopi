import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";
import { errorResponse, notImplementedResponse } from "@/lib/response";
import {
  listIngredients,
  createIngredient,
} from "@/modules/ingredients/service";
import { CreateIngredientRequestSchema } from "@/modules/ingredients/schema";

export async function GET(req: NextRequest) {
  try {
    const user = await requireRole(req, ["barista", "owner_admin"]);
    await listIngredients(user);
    return notImplementedResponse("GET /api/ingredients");
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "statusCode" in error &&
      (error as { statusCode: number }).statusCode === 501
    ) {
      return notImplementedResponse("GET /api/ingredients");
    }
    return errorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireRole(req, ["barista", "owner_admin"]);
    const body = await req.json();
    const validated = CreateIngredientRequestSchema.parse(body);

    await createIngredient(user, validated);
    return notImplementedResponse("POST /api/ingredients");
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "statusCode" in error &&
      (error as { statusCode: number }).statusCode === 501
    ) {
      return notImplementedResponse("POST /api/ingredients");
    }
    return errorResponse(error);
  }
}
