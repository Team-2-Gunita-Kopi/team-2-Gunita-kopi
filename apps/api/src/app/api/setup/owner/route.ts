import { NextRequest } from "next/server";
import { errorResponse, jsonResponse } from "@/lib/response";
import { readJson } from "@/lib/request";
import { provisionInitialOwner } from "@/modules/setup/service";
import { OwnerSetupRequestSchema } from "@/modules/setup/schema";

// One-time Owner provisioning by the developer (scripts/provision-owner.mjs), authorized by
// X-Setup-Token = OWNER_SETUP_TOKEN. Not reachable through the Admin or POS site.
export async function POST(req: NextRequest) {
  try {
    const validated = await readJson(req, OwnerSetupRequestSchema);
    return jsonResponse(
      await provisionInitialOwner(req.headers.get("x-setup-token"), validated),
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
