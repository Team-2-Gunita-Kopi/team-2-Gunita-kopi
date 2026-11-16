export function getAllowedOrigins(): string[] {
  const envOrigins =
    process.env.ALLOWED_ORIGINS ||
    "http://localhost:3000,http://localhost:3001";
  return envOrigins
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

export function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  const allowed = getAllowedOrigins();
  return allowed.includes(origin);
}

export function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowed = isOriginAllowed(origin);
  const allowOriginValue =
    allowed && origin
      ? origin
      : getAllowedOrigins()[0] || "http://localhost:3000";

  return {
    "Access-Control-Allow-Origin": allowOriginValue,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Requested-With, X-Request-ID",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  };
}
