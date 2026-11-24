import { NextRequest } from "next/server";
import { errorResponse, jsonResponse } from "@/server/lib/response";
import { readJson } from "@/server/lib/request";
import { provisionInitialOwner } from "@/server/modules/setup/service";
import { OwnerSetupRequestSchema } from "@/server/modules/setup/schema";

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
