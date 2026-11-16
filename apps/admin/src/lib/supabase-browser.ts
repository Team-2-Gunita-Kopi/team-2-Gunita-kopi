import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

/**
 * Browser Supabase client strictly used for Authentication (Sign in, Sign out, Session).
 * Never used for direct database access or queries.
 */
export const supabaseBrowser = createClient(
  env.supabaseUrl,
  env.supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
