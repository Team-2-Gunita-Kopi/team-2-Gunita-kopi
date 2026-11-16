import { CreateStockTransactionRequest, StockTransaction } from "./schema";
import { AuthenticatedUser } from "@/lib/auth";
import { NotImplementedError } from "@/lib/errors";

export async function listStockTransactions(
  _user: AuthenticatedUser,
): Promise<StockTransaction[]> {
  // TODO: Query stock_transactions table via user.supabaseClient
  throw new NotImplementedError(
    "List stock transactions service is not implemented yet.",
  );
}

export async function createStockTransaction(
  _user: AuthenticatedUser,
  _data: CreateStockTransactionRequest,
): Promise<StockTransaction> {
  // TODO: Insert stock transaction and update ingredient current_stock atomically
  throw new NotImplementedError(
    "Create stock transaction service is not implemented yet.",
  );
}
