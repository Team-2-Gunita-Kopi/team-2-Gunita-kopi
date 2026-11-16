import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth";
import { errorResponse, notImplementedResponse } from "@/lib/response";
import { generateReport } from "@/modules/reports/service";
import { ReportTypeSchema } from "@/modules/reports/schema";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ type: string }> },
) {
  try {
    const { type } = await params;
    const user = await requireRole(req, "owner_admin");
    const validatedType = ReportTypeSchema.parse(type);

    await generateReport(user, validatedType);
    return notImplementedResponse(`GET /api/reports/${type}`);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "statusCode" in error &&
      (error as { statusCode: number }).statusCode === 501
    ) {
      const { type } = await params;
      return notImplementedResponse(`GET /api/reports/${type}`);
    }
    return errorResponse(error);
  }
}
