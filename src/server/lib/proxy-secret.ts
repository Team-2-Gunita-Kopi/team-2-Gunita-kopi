import { createHash, timingSafeEqual } from "node:crypto";

export function hasValidInternalProxySecret(headers: Headers): boolean {
  const expected = process.env.INTERNAL_PROXY_SECRET ?? "";
  const given = headers.get("x-gunita-proxy-secret") ?? "";
  if (expected.length < 32) return false;
  return timingSafeEqual(
    createHash("sha256").update(given).digest(),
    createHash("sha256").update(expected).digest(),
  );
}
