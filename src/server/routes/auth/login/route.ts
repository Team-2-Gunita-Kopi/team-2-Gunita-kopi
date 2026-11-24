import { NextRequest } from "next/server";
import { errorResponse, jsonResponse } from "@/server/lib/response";
import { readJson } from "@/server/lib/request";
import { loginWithUsername } from "@/server/modules/session/service";
import { LoginRequestSchema } from "@/server/modules/session/schema";
import { clientIp, signInUnavailable } from "@/server/lib/login-throttle";

// Username + password sign-in, called server to server by the Admin and POS sites (/auth/login),
// which store the returned session in an HttpOnly cookie.
export async function POST(req: NextRequest) {
  try {
    const validated = await readJson(req, LoginRequestSchema);
    const ip = clientIp(req);
    // No trustworthy client IP: refuse rather than share one throttle bucket.
    if (!ip) throw signInUnavailable();
    return jsonResponse(await loginWithUsername(validated, ip));
  } catch (error) {
    return errorResponse(error);
  }
}
