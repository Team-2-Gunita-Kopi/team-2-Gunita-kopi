import { requireRole } from "@/server/lib/auth";
import { jsonResponse, route } from "@/server/lib/response";
import { readJson, readQuery } from "@/server/lib/request";
import {
  CreateProductRequestSchema,
  ProductListQuerySchema,
} from "@/contracts";
import { createProduct, listProducts } from "@/server/modules/products/service";

// FR-05: both roles read the catalog (POS order entry).
export const GET = route(async (req) => {
  const user = await requireRole(req, ["owner_admin", "barista"]);
  return jsonResponse(
    await listProducts(user, readQuery(req, ProductListQuerySchema)),
  );
});

// FR-50, FR-52
export const POST = route(async (req) => {
  const user = await requireRole(req, "owner_admin");
  const body = await readJson(req, CreateProductRequestSchema);
  return jsonResponse(await createProduct(user, body), { status: 201 });
});
