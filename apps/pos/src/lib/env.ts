/**
 * Client and runtime environment variable validation for POS website.
 */

export const env = {
  supabaseUrl:
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "https://placeholder-project-ref.supabase.co",
  supabaseAnonKey:
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key",
  apiUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3002",
};

export function validatePosEnv(): void {
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
  if (
    !process.env.NEXT_PUBLIC_API_URL &&
    process.env.NODE_ENV === "production"
  ) {
    missing.push("NEXT_PUBLIC_API_URL");
  }

  if (missing.length > 0) {
    throw new Error(
      `[POS] Missing required environment variables: ${missing.join(", ")}`,
    );
  }
}
