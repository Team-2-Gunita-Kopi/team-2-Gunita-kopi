const HOME = "/admin/dashboard";

/** Same-origin paths only: resolve against our origin and compare (handles "/\evil", tabs, etc.). */
export function safeRedirect(value: string | null): string {
  if (!value) return HOME;
  try {
    const u = new URL(value, window.location.origin);
    if (u.origin !== window.location.origin) return HOME;
    const path = u.pathname + u.search + u.hash;
    // Only pages of the Owner area (one app hosts both areas); "/admin/login" would loop back.
    return path.startsWith("/admin/") && !path.startsWith("/admin/login") ? path : HOME;
  } catch {
    return HOME;
  }
}
