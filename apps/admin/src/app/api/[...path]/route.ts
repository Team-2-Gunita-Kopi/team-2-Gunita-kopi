import { session } from "@/lib/session-handlers";

// Same-origin proxy to apps/api; adds the Bearer token from the HttpOnly session cookie.
export const GET = session.proxy;
export const POST = session.proxy;
export const PUT = session.proxy;
export const PATCH = session.proxy;
export const DELETE = session.proxy;
