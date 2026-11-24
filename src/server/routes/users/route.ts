import { requireRole } from "@/server/lib/auth";
import { jsonResponse, route } from "@/server/lib/response";
import { readQuery } from "@/server/lib/request";
import { UserListQuerySchema } from "@/contracts";
import { listUsers } from "@/server/modules/users/service";

// Staff accounts, Owner only. New accounts: POST /api/admin/employees.
export const GET = route(async (req) => {
  const user = await requireRole(req, "owner_admin");
  return jsonResponse(
    await listUsers(user, readQuery(req, UserListQuerySchema)),
  );
});
