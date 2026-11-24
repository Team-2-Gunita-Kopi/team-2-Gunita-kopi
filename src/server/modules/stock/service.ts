import type {
  CreateStockTransactionRequest,
  Page,
  StockTransaction,
  StockTransactionListQuery,
} from "@/contracts";
import { AuthenticatedUser } from "@/server/lib/auth";
import { dbError, ForbiddenError } from "@/server/lib/errors";
import { pageRange, toPage } from "@/server/lib/request";
import { getIngredient } from "@/server/modules/ingredients/service";
import { manilaDayStart, manilaNextDayStart } from "@/server/lib/dates";

const SELECT =
  "stock_trans_id, ingredient_id, user_id, type, quantity, remaining_stock, date_time, remarks, ingredients(ingredient_name, unit), users(full_name)";

/**
 * The Owner and Barista may record stock-in and stock-out.
 * RLS enforces the same rule; checkout stock-out goes through process_checkout_transaction.
 */
interface TxRow {
  stock_trans_id: number;
  ingredient_id: number;
  user_id: number | null;
  type: string;
  quantity: number;
  remaining_stock: number | null;
  date_time: string;
  remarks: string | null;
  ingredients: { ingredient_name: string; unit: string | null } | null;
  users: { full_name: string } | null;
}

const toTransaction = (r: TxRow): StockTransaction => ({
  id: r.stock_trans_id,
  ingredientId: r.ingredient_id,
  ingredientName: r.ingredients?.ingredient_name ?? null,
  ingredientUnit: r.ingredients?.unit ?? null,
  type: r.type as StockTransaction["type"],
  quantity: r.quantity,
  remainingStock: r.remaining_stock,
  userId: r.user_id,
  userName: r.users?.full_name ?? null,
  dateTime: r.date_time,
  remarks: r.remarks,
});

export async function listStockTransactions(
  user: AuthenticatedUser,
  q: StockTransactionListQuery,
): Promise<Page<StockTransaction>> {
  let query = user.supabaseClient
    .from("stock_transactions")
    .select(SELECT, { count: "exact" })
    .order("date_time", { ascending: false })
    .order("stock_trans_id", { ascending: false })
    .range(...pageRange(q));
  if (q.ingredientId) query = query.eq("ingredient_id", q.ingredientId);
  if (q.type) query = query.eq("type", q.type);
  if (q.from) query = query.gte("date_time", manilaDayStart(q.from));
  if (q.to) query = query.lt("date_time", manilaNextDayStart(q.to));
  const { data, error, count } = await query;
  if (error) throw dbError(error);
  return toPage(data.map(toTransaction), count, q);
}

/**
 * The database trigger updates current_stock, records remaining_stock and refuses negative stock
 * (STOCK_CONFLICT, 409) in the same statement, so stock and history never disagree.
 */
export async function createStockTransaction(
  user: AuthenticatedUser,
  body: CreateStockTransactionRequest,
): Promise<StockTransaction> {
  if (user.role !== "owner_admin" && user.role !== "barista") {
    throw new ForbiddenError("Only the Owner/Manager or Barista/Service Staff may record stock movements");
  }
  await getIngredient(user, body.ingredientId); // 404 instead of a misleading stock conflict
  const { data, error } = await user.supabaseClient
    .from("stock_transactions")
    .insert({
      ingredient_id: body.ingredientId,
      user_id: user.userId,
      type: body.type,
      quantity: body.quantity,
      remarks: body.remarks ?? null,
    })
    .select(SELECT)
    .single();
  if (error) throw dbError(error);
  return toTransaction(data);
}
