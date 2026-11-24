import { NextResponse, type NextRequest } from "next/server";
import { requestIdFrom } from "./lib/request-id";

// Browsers never call the API: the Admin and POS servers proxy to it (a private Vercel service), so
// no CORS here. Demo mode's /api/mock/rpc sets its own CORS headers (lib/cors.ts).
export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  response.headers.set(
    "X-Request-ID",
    requestIdFrom(request.headers.get("x-request-id")),
  );
  return response;
}

export const config = {
  matcher: ["/api/:path*"],
};
