import { requireRole } from "@/lib/auth";
import { jsonResponse, route } from "@/lib/response";
import { readQuery } from "@/lib/request";
import { UserListQuerySchema } from "@gunita/contracts";
import { listUsers } from "@/modules/users/service";

// Staff accounts, Owner only. New accounts: POST /api/admin/employees.
export const GET = route(async (req) => {
  const user = await requireRole(req, "owner_admin");
  return jsonResponse(
    await listUsers(user, readQuery(req, UserListQuerySchema)),
  );
});
