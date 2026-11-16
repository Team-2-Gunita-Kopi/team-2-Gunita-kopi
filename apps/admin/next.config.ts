import type { NextConfig } from "next";

// Enforce environment validation at build time
const requiredEnvs = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_API_URL",
];
for (const envVar of requiredEnvs) {
  if (!process.env[envVar]) {
    // In CI or production build, throw if missing; default placeholder allows static evaluation if needed
    if (process.env.NODE_ENV === "production" && !process.env.CI) {
      throw new Error(
        `[Admin Config] Missing required environment variable: ${envVar}`,
      );
    }
  }
}

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
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
