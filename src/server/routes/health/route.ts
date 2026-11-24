import { jsonResponse } from "@/server/lib/response";

export async function GET() {
  return jsonResponse({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
}
