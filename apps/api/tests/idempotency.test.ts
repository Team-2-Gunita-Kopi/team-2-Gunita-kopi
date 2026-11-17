import { describe, it, expect } from "vitest";
import { checkTransactionIdempotency } from "../src/lib/idempotency";
import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@gunita/db-types";

function mockPayments(existing: Record<string, number>) {
  return {
    from: () => ({
      select: () => ({
        eq: (_col: string, tx: string) => ({
          maybeSingle: async () => ({
            data: tx in existing ? { order_id: existing[tx] } : null,
            error: null,
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient<Database>;
}

describe("Transaction Idempotency", () => {
  const savedTx = "7b0e4a52-2f5c-4c1e-9a7d-3f8e2b1c6d40";

  it("returns isDuplicate: false for new transaction IDs", async () => {
    const result = await checkTransactionIdempotency(
      mockPayments({ [savedTx]: 12 }),
      "0f6c2d1e-8b3a-4f5e-9c7d-1a2b3c4d5e6f",
    );
    expect(result.isDuplicate).toBe(false);
  });

  it("returns the existing order for an already-saved transaction", async () => {
    const result = await checkTransactionIdempotency(
      mockPayments({ [savedTx]: 12 }),
      savedTx,
    );
    expect(result).toEqual({ isDuplicate: true, existingOrderId: "12" });
  });

  it("handles empty transaction ID safely", async () => {
    const result = await checkTransactionIdempotency(mockPayments({}), "");
    expect(result.isDuplicate).toBe(false);
  });
});
