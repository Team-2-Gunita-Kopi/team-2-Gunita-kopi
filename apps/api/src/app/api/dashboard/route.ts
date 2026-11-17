import { requireRole } from "@/lib/auth";
import { jsonResponse, route } from "@/lib/response";
import { getDashboardStats } from "@/modules/dashboard/service";

// FR-36 to FR-39, Owner only.
export const GET = route(async (req) => {
  const user = await requireRole(req, "owner_admin");
  return jsonResponse(await getDashboardStats(user));
});
