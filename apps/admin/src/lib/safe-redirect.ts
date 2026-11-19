const HOME = "/dashboard";

/** Same-origin paths only: resolve against our origin and compare (handles "/\evil", tabs, etc.). */
export function safeRedirect(value: string | null): string {
  if (!value) return HOME;
  try {
    const u = new URL(value, window.location.origin);
    if (u.origin !== window.location.origin) return HOME;
    const path = u.pathname + u.search + u.hash;
    // "//host" would be protocol-relative; "/login" and "/mfa" would loop back.
    return path.startsWith("//") ||
      path.startsWith("/login") ||
      path.startsWith("/mfa")
      ? HOME
      : path;
  } catch {
    return HOME;
  }
}
