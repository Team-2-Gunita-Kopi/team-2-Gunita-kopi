import { requireRole } from "@/lib/auth";
import { jsonResponse, route } from "@/lib/response";
import { readId, readJson } from "@/lib/request";
import { UpdateUserRequestSchema } from "@gunita/contracts";
import { getUser, updateUser } from "@/modules/users/service";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (req, ctx: Ctx) => {
  const user = await requireRole(req, "owner_admin");
  return jsonResponse(await getUser(user, await readId(ctx)));
});

// Full name and active status only (role and identity are fixed).
export const PATCH = route(async (req, ctx: Ctx) => {
  const user = await requireRole(req, "owner_admin");
  const id = await readId(ctx);
  const body = await readJson(req, UpdateUserRequestSchema);
  return jsonResponse(await updateUser(user, id, body));
});
