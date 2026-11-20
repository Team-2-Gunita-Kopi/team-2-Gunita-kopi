import { isLoopbackUrl } from "@gunita/auth";
import { hasValidInternalProxySecret } from "@/lib/proxy-secret";

export function canUseLocalOwnerSetupWithoutToken(req: Request): boolean {
  if (
    process.env.NODE_ENV !== "development" ||
    req.headers.has("x-setup-token") ||
    !isLoopbackUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "") ||
    !isLoopbackUrl(req.url)
  ) {
    return false;
  }
  return hasValidInternalProxySecret(req.headers);
}
