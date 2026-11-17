import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

// Validate environment variables at build time
const requiredEnvs = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_API_URL",
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
  reactStrictMode: true,
  transpilePackages: [
    "@gunita/contracts",
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
