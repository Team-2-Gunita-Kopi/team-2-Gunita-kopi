import { requireRole } from "@/server/lib/auth";
import { jsonResponse, route } from "@/server/lib/response";
import { readId, readJson } from "@/server/lib/request";
import { UpdateUserRequestSchema } from "@/contracts";
import { getUser, updateUser } from "@/server/modules/users/service";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (req, ctx: Ctx) => {
  const user = await requireRole(req, "owner_admin");
  return jsonResponse(await getUser(user, await readId(ctx)));
});

// Full name, username, active status and a new password (the role is fixed). The Owner's own
// password change needs currentPassword.
export const PATCH = route(async (req, ctx: Ctx) => {
  const user = await requireRole(req, "owner_admin");
  const id = await readId(ctx);
  const body = await readJson(req, UpdateUserRequestSchema);
  return jsonResponse(await updateUser(user, id, body));
});
