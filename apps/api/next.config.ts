import type { NextConfig } from "next";

// Enforce environment validation for API at build time
const requiredEnvs = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ALLOWED_ORIGINS",
];

for (const envVar of requiredEnvs) {
  if (
    !process.env[envVar] &&
    process.env.NODE_ENV === "production" &&
    !process.env.CI
  ) {
    throw new Error(
      `[API Config] Missing required environment variable: ${envVar}`,
    );
  }
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@gunita/contracts",
    "@gunita/auth",
    "@gunita/db-types",
    "@gunita/config",
    "@gunita/mocks",
  ],
};

export default nextConfig;
