import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

// Build-time check of required variables (skipped in CI, where the build runs without secrets).
const requiredEnvs = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];
for (const envVar of requiredEnvs) {
  if (!process.env[envVar] && process.env.NODE_ENV === "production" && !process.env.CI) {
    throw new Error(`[Config] Missing required environment variable: ${envVar}`);
  }
}

// The POS service worker lives under /staff and controls only /staff pages (never the Owner portal).
// It is registered by the staff layout (src/staff/components/ServiceWorkerRegister.tsx).
const withSerwist = withSerwistInit({
  swSrc: "src/staff/sw.ts",
  swDest: "public/staff/sw.js",
  swUrl: "/staff/sw.js",
  scope: "/staff/",
  register: false,
  // Serwist's entry script is in the shared bundle: a reload on reconnect would also wipe unsaved
  // Owner forms. The POS outbox already syncs on the online event (src/staff/offline/triggers.ts).
  reloadOnOnline: false,
  // Barista tablets never need Owner portal code offline.
  manifestTransforms: [
    async (entries) => ({
      manifest: entries.filter((e) => !e.url.includes("/app/(owner)/")),
      warnings: [],
    }),
  ],
  disable: process.env.NODE_ENV === "development",
});

const securityHeaders = [
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    // Interim static policy, enforced; the nonce-based CSP of spec S4 follows after launch. It blocks
    // external scripts, eval and cross-origin requests, but 'unsafe-inline' (needed by Next.js inline
    // scripts until nonces) still lets an injected inline script run; session tokens are HttpOnly.
    // Only `next dev` adds 'unsafe-eval' (Fast Refresh); production builds never allow eval.
    key: "Content-Security-Policy",
    value: `default-src 'self'; script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.supabase.co; font-src 'self' data:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'`,
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    // The bare address and the old POS start URL open the POS, never the Owner sign-in.
    return [{ source: "/pos", destination: "/staff/pos", permanent: false }];
  },
};

export default withSerwist(nextConfig);
