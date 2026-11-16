import { describe, it, expect } from "vitest";
import { checkTransactionIdempotency } from "../src/lib/idempotency";
import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@gunita/db-types";

describe("Transaction Idempotency", () => {
  it("returns isDuplicate: false for new transaction IDs", async () => {
    // Mock Supabase client
    const mockSupabase = {} as unknown as SupabaseClient<Database>;
    const result = await checkTransactionIdempotency(
      mockSupabase,
      "tx_unique_001",
    );
    expect(result.isDuplicate).toBe(false);
  });

  it("handles empty transaction ID safely", async () => {
    const mockSupabase = {} as unknown as SupabaseClient<Database>;
    const result = await checkTransactionIdempotency(mockSupabase, "");
    expect(result.isDuplicate).toBe(false);
  });
});
