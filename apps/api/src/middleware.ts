import { NextResponse, type NextRequest } from "next/server";
import { getCorsHeaders } from "./lib/cors";

export function middleware(request: NextRequest) {
  const origin = request.headers.get("origin");
  const requestId =
    request.headers.get("x-request-id") ||
    `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const corsHeaders = getCorsHeaders(origin);

  // Handle preflight OPTIONS request
  if (request.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: {
        ...corsHeaders,
        "X-Request-ID": requestId,
      },
    });
  }

  // Pass request along and append CORS & request ID to response
  const response = NextResponse.next();
  Object.entries(corsHeaders).forEach(([key, val]) => {
    response.headers.set(key, val);
  });
  response.headers.set("X-Request-ID", requestId);

  return response;
}

export const config = {
  matcher: ["/api/:path*"],
};
