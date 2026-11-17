const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const IPV6 = /^[0-9a-f:.]+$/i;

export function isIpAddress(value: string): boolean {
  return IPV4.test(value) || (value.includes(":") && IPV6.test(value));
}

/**
 * Client IP, read only from a header the hosting platform sets (never a client-supplied one).
 * - Vercel (VERCEL=1): x-real-ip; Vercel overwrites any value the client sends.
 * - Own reverse proxy: set TRUSTED_CLIENT_IP_HEADER to the header it sets; the last hop is used.
 * - Local development: 127.0.0.1 (one machine).
 * - Production without a trusted source: null, and callers fail closed instead of sharing a bucket.
 */
export function trustedClientIp(headers: Headers): string | null {
  const header =
    process.env.TRUSTED_CLIENT_IP_HEADER ||
    (process.env.VERCEL === "1" ? "x-real-ip" : "");
  if (header) {
    const value = headers.get(header)?.split(",").pop()?.trim() ?? "";
    return isIpAddress(value) ? value : null;
  }
  return process.env.NODE_ENV === "production" ? null : "127.0.0.1";
}
