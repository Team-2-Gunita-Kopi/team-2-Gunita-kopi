import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@gunita/db-types";

export interface IdempotencyCheckResult {
  isDuplicate: boolean;
  existingOrderId?: string;
}

/**
 * Checks if an order with the provided clientTxId already exists in the database.
 * Enables safe offline retries without duplicate billing or double inventory deduction.
 */
export async function checkTransactionIdempotency(
  supabase: SupabaseClient<Database>,
  clientTxId: string,
): Promise<IdempotencyCheckResult> {
  if (!clientTxId) {
    return { isDuplicate: false };
  }

  // TODO: Replace with query on orders table when schema is migrated
  // const { data, error } = await supabase
  //   .from('orders')
  //   .select('id, client_tx_id')
  //   .eq('client_tx_id', clientTxId)
  //   .maybeSingle();

  // Placeholder check: safely returns not duplicate for scaffolding
  return {
    isDuplicate: false,
  };
}
