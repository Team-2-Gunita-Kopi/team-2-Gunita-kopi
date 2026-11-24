import { productImageSrc, type Product } from "@/contracts";
import { withBasePath } from "@/owner/lib/base-path";

/** Stored photos are served by the backend through this area's /admin/api proxy. */
export const ownerImageSrc = (p: Product): string | undefined => {
  const src = productImageSrc(p);
  return src ? withBasePath(src) : src;
};
