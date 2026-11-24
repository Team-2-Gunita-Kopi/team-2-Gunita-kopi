import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

// Validate environment variables at build time
const requiredEnvs = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
];
for (const envVar of requiredEnvs) {
  if (
    !process.env[envVar] &&
    process.env.NODE_ENV === "production" &&
    !process.env.CI
  ) {
    throw new Error(
      `[POS Config] Missing required environment variable: ${envVar}`,
    );
  }
}

const withSerwist = withSerwistInit({
  swSrc: "src/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  // Keep in sync with src/lib/base-path.ts (BASE_PATH) and the /staff rewrites in vercel.json.
  basePath: "/staff",
  reactStrictMode: true,
  transpilePackages: [
    "@gunita/contracts",
    "@gunita/mocks",
    "@gunita/auth",
    "@gunita/ui",
    "@gunita/config",
  ],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            // Report-only until a preview shows no reports (spec S4). To enforce, merge these
            // directives into the Content-Security-Policy entry above: two entries with the same key
            // overwrite each other. Development also needs 'unsafe-eval' and the demo API origin.
            key: "Content-Security-Policy-Report-Only",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.supabase.co; font-src 'self' data:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
          },
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            // Baseline CSP that cannot break Next.js inline scripts; session tokens are HttpOnly.
            key: "Content-Security-Policy",
            value:
              "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
    ];
  },
};

export default withSerwist(nextConfig);
