import { describe, expect, it, vi } from "vitest";

const cspFor = async (nodeEnv: string) => {
  vi.stubEnv("NODE_ENV", nodeEnv);
  vi.stubEnv("CI", "true"); // skips the production check for real Supabase variables
  vi.resetModules();
  try {
    const config = (await import("../../next.config")).default;
    const headers = (await config.headers?.())?.[0]?.headers ?? [];
    return { headers, csp: headers.find((h) => h.key === "Content-Security-Policy")?.value ?? "" };
  } finally {
    vi.unstubAllEnvs();
  }
};

// Why: one app serves both areas. The old POS start URL must open the POS, every response must
// carry the security headers, and the API must not be exposed by a rewrite.
describe("next.config", () => {
  it("redirects /pos to the POS and sets the security headers", { timeout: 60_000 }, async () => {
    const config = (await import("../../next.config")).default;
    expect(await config.redirects?.()).toContainEqual({ source: "/pos", destination: "/staff/pos", permanent: false });
    const headers = (await config.headers?.())?.[0]?.headers.map((h) => h.key) ?? [];
    expect(headers).toEqual(expect.arrayContaining(["Strict-Transport-Security", "X-Frame-Options", "Content-Security-Policy"]));
    expect(config.rewrites).toBeUndefined();
  });

  // Why: the strict policy protects users only when enforced; a report-only copy just logs. A
  // production build must allow its own inline scripts (no nonces yet, or every page breaks) but
  // never eval or other hosts; only `next dev` may allow eval (Fast Refresh).
  it("enforces the strict Content-Security-Policy, with eval only in development", { timeout: 60_000 }, async () => {
    const prod = await cspFor("production");
    expect(prod.csp).toContain("default-src 'self'");
    expect(prod.csp).toContain("script-src 'self' 'unsafe-inline';");
    expect(prod.csp).toContain("connect-src 'self'");
    expect(prod.csp).toContain("frame-ancestors 'none'");
    expect(prod.headers.some((h) => h.key === "Content-Security-Policy-Report-Only")).toBe(false);

    const dev = await cspFor("development");
    expect(dev.csp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval';");
  });
});
