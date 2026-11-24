import { requireRole } from "@/server/lib/auth";
import { jsonResponse, route } from "@/server/lib/response";
import { listBaristaSupplierOptions } from "@/server/modules/suppliers/service";

// Baristas can select an existing active supplier when adding an ingredient.
export const GET = route(async (req) => {
  const user = await requireRole(req, "barista");
  return jsonResponse(await listBaristaSupplierOptions(user));
});
