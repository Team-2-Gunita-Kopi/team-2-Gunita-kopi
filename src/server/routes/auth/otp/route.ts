import { NextRequest } from "next/server";
import { errorResponse, jsonResponse } from "@/server/lib/response";
import { readJson } from "@/server/lib/request";
import { ownerOtp } from "@/server/modules/session/service";
import { OwnerOtpRequestSchema } from "@/server/modules/session/schema";

// Owner's emailed sign-in code, called server to server by the Admin site (/auth/otp) with the
// challenge from POST /api/auth/login. "verify" returns the approved session.
export async function POST(req: NextRequest) {
  try {
    return jsonResponse(
      await ownerOtp(await readJson(req, OwnerOtpRequestSchema)),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
