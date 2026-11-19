import { requireRole } from "@/lib/auth";
import { jsonResponse, route } from "@/lib/response";
import { readId } from "@/lib/request";
import {
  assertImageLength,
  getProductImage,
  removeProductImage,
  setProductImage,
} from "@/modules/products/service";

type Ctx = { params: Promise<{ id: string }> };

// FR-50 product image. The bucket is private (SDS 2.6, 2.8): pages load the file through this
// route (same-origin proxy, caller's token), so Storage RLS checks every read.
export const GET = route(async (req, ctx: Ctx) => {
  const user = await requireRole(req, ["owner_admin", "barista"]);
  const image = await getProductImage(user, await readId(ctx));
  return new Response(image, {
    headers: {
      "content-type": image.type,
      "cache-control": "private, max-age=300",
      "x-content-type-options": "nosniff",
    },
  });
});

// Owner only. Raw image bytes as the body (PNG, JPEG or WebP, at most 2 MB).
export const PUT = route(async (req, ctx: Ctx) => {
  const user = await requireRole(req, "owner_admin");
  const id = await readId(ctx);
  assertImageLength(req.headers.get("content-length"));
  const bytes = new Uint8Array(await req.arrayBuffer());
  return jsonResponse(await setProductImage(user, id, bytes));
});

export const DELETE = route(async (req, ctx: Ctx) => {
  const user = await requireRole(req, "owner_admin");
  return jsonResponse(await removeProductImage(user, await readId(ctx)));
});
