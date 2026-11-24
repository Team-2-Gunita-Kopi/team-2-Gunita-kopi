const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Keeps a caller's X-Request-ID only when it is short and plain (it is echoed in the response header); otherwise makes one. */
export function requestIdFrom(header: string | null): string {
  if (header && SAFE_ID.test(header)) return header;
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}
