import { session } from "@/owner/lib/session-handlers";

// Same-origin proxy to the backend (src/server, called in process); adds the Bearer token from the
// HttpOnly session cookie, which is scoped to this area's prefix.
export const GET = session.proxy;
export const POST = session.proxy;
export const PUT = session.proxy;
export const PATCH = session.proxy;
export const DELETE = session.proxy;
