/**
 * Client and runtime environment variable validation for Admin website.
 * Ensures required variables are defined and warns/throws if missing.
 */

export const env = {
  supabaseUrl:
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "https://placeholder-project-ref.supabase.co",
  supabaseAnonKey:
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key",
  /** Demo mode only: the browser calls apps/api /api/mock/rpc directly. */
  mockApiUrl: process.env.NEXT_PUBLIC_API_URL || "",
};

export function validateAdminEnv(): void {
  const missing: string[] = [];
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NODE_ENV === "production"
  ) {
    missing.push("NEXT_PUBLIC_SUPABASE_URL");
  }
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.NODE_ENV === "production"
  ) {
    missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  if (missing.length > 0) {
    throw new Error(
      `[Admin] Missing required environment variables: ${missing.join(", ")}`,
    );
  }
}
