import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/db-types";
import { AppError } from "./errors";

export interface IdempotencyCheckResult {
  isDuplicate: boolean;
  existingOrderId?: string;
}

/**
 * Checks if a sale with the provided clientTxId was already saved.
 * payments.client_tx_id is unique (one payment per sale), so it is the idempotency key.
 * process_checkout_transaction repeats this check atomically; this is the cheap pre-check.
 */
export async function checkTransactionIdempotency(
  supabase: SupabaseClient<Database>,
  clientTxId: string,
): Promise<IdempotencyCheckResult> {
  if (!clientTxId) {
    return { isDuplicate: false };
  }

  const { data, error } = await supabase
    .from("payments")
    .select("order_id")
    .eq("client_tx_id", clientTxId)
    .maybeSingle();

  if (error) {
    throw new AppError(error.message, 500, "DATABASE_ERROR");
  }

  return data
    ? { isDuplicate: true, existingOrderId: String(data.order_id) }
    : { isDuplicate: false };
}
