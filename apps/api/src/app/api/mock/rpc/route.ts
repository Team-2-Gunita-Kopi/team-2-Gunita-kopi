import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { MockError, OWNER_OPS, POS_OPS } from "@gunita/mocks/owner";
import { getCorsHeaders } from "@/lib/cors";
import { getSharedMockDb } from "@/lib/mock-db";

const BodySchema = z.object({
  app: z.enum(["owner", "pos"]),
  op: z.string(),
  args: z.array(z.unknown()).default([]),
});

const ALLOWED: Record<"owner" | "pos", readonly string[]> = { owner: OWNER_OPS, pos: POS_OPS };

function fail(status: number, code: string, message: string, cors: Record<string, string>) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status, headers: cors });
}

export function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(request.headers.get("origin")) });
}

export async function POST(request: NextRequest) {
  const cors = getCorsHeaders(request.headers.get("origin"));
  if (process.env.MOCK_MODE !== "true") return fail(404, "NOT_FOUND", "Mock mode is off", cors);

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return fail(400, "VALIDATION", "Body must be JSON", cors);
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return fail(400, "VALIDATION", parsed.error.message, cors);
  const { app, op, args } = parsed.data;
  if (!ALLOWED[app].includes(op)) return fail(400, "UNKNOWN_OP", `Unknown op "${op}" for app "${app}"`, cors);

  try {
    const target = getSharedMockDb()[app] as unknown as Record<string, (...a: unknown[]) => unknown>;
    const data = target[op]!(...args);
    return NextResponse.json({ ok: true, data: data ?? null }, { headers: cors });
  } catch (err) {
    if (err instanceof MockError) return fail(400, err.code, err.message, cors);
    console.error("[mock-rpc] unexpected error", err);
    return fail(500, "INTERNAL", err instanceof Error ? err.message : "Internal error", cors);
  }
}
