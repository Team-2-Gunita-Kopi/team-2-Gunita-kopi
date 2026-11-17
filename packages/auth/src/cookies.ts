/**
 * Session cookie set and read only by the Admin/POS servers (middleware, /auth routes, /api proxy).
 * HttpOnly: page scripts never see the tokens. SameSite=Lax: no cross-site POST carries it.
 */
export function sessionCookieOptions(name: string) {
  return {
    name,
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}
