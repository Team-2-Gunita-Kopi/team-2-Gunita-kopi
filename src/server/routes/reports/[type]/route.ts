import { requireRole } from "@/server/lib/auth";
import { jsonResponse, route } from "@/server/lib/response";
import { readQuery } from "@/server/lib/request";
import { ReportQuerySchema, ReportTypeSchema } from "@/contracts";
import { generateReport } from "@/server/modules/reports/service";

type Ctx = { params: Promise<{ type: string }> };

// FR-30 to FR-35, Owner only: daily | monthly | best-sellers | stock-status
export const GET = route(async (req, ctx: Ctx) => {
  const user = await requireRole(req, "owner_admin");
  const type = ReportTypeSchema.parse((await ctx.params).type);
  return jsonResponse(
    await generateReport(user, type, readQuery(req, ReportQuerySchema)),
  );
});
