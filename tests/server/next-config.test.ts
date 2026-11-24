import { describe, expect, it } from "vitest";

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
});
