/** The POS is served under this prefix: one Vercel project, Admin at /, POS at /staff. */
export const BASE_PATH = "/staff";

/** Adds BASE_PATH to a root-relative path once (API calls, icons, manifest). Full URLs pass through. */
export function withBasePath(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  if (path === BASE_PATH || path.startsWith(`${BASE_PATH}/`)) return path;
  return `${BASE_PATH}${path}`;
}
