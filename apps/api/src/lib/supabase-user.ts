import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@gunita/db-types";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://placeholder-project-ref.supabase.co";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

/**
 * Creates a scoped Supabase client authenticated with the caller's JWT token.
 * This guarantees that Supabase Row Level Security (RLS) policies are fully enforced.
 */
export function createScopedUserClient(
  accessToken: string,
): SupabaseClient<Database> {
  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Unauthenticated client (publishable key) used by the login endpoint for password sign-in.
 * Keeps no session between requests.
 */
export function createAuthClient(): SupabaseClient<Database> {
  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
