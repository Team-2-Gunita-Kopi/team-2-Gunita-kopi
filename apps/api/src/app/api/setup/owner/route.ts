import { NextRequest } from "next/server";
import { errorResponse, jsonResponse } from "@/lib/response";
import { provisionInitialOwner } from "@/modules/setup/service";
import { OwnerSetupRequestSchema } from "@/modules/setup/schema";

// One-time Owner registration. Authorized by the X-Setup-Token header, not a session.
export async function POST(req: NextRequest) {
  try {
    const validated = OwnerSetupRequestSchema.parse(await req.json());
    return jsonResponse(
      await provisionInitialOwner(req.headers.get("x-setup-token"), validated),
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
