import { NextRequest } from "next/server";
import { errorResponse, jsonResponse } from "@/lib/response";
import { readJson } from "@/lib/request";
import { canUseLocalOwnerSetupWithoutToken } from "@/modules/setup/local-no-token";
import { provisionInitialOwner } from "@/modules/setup/service";
import { OwnerSetupRequestSchema } from "@/modules/setup/schema";

// One-time Owner registration. Tokenless requests are accepted only from the trusted local proxy.
export async function POST(req: NextRequest) {
  try {
    const validated = await readJson(req, OwnerSetupRequestSchema);
    const setupToken = req.headers.get("x-setup-token");
    return jsonResponse(
      await provisionInitialOwner(setupToken, validated, {
        allowLocalNoToken:
          setupToken === null && canUseLocalOwnerSetupWithoutToken(req),
      }),
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
