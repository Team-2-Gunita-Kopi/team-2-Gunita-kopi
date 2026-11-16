import "server-only";
import { createClient } from "@supabase/supabase-js";
import { Database } from "@gunita/db-types";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://placeholder-project-ref.supabase.co";
const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";

/**
 * Privileged Supabase Admin Client using the service role key.
 * Strictly used ONLY where necessary:
 * - Provisioning employee accounts (POST /api/admin/employees)
 * - Writing security/application audit logs
 * Never used for normal business queries where user RLS should apply.
 */
export const supabaseAdmin = createClient<Database>(
  supabaseUrl,
  supabaseServiceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);
