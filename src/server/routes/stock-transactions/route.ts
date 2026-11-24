import { requireRole } from "@/server/lib/auth";
import { jsonResponse, route } from "@/server/lib/response";
import { readJson, readQuery } from "@/server/lib/request";
import {
  CreateStockTransactionRequestSchema,
  StockTransactionListQuerySchema,
} from "@/contracts";
import {
  createStockTransaction,
  listStockTransactions,
} from "@/server/modules/stock/service";

// Stock history, both roles.
export const GET = route(async (req) => {
  const user = await requireRole(req, ["owner_admin", "barista"]);
  return jsonResponse(
    await listStockTransactions(
      user,
      readQuery(req, StockTransactionListQuerySchema),
    ),
  );
});

// FR-15/FR-16: both Owner and Barista may record stock-in or stock-out.
export const POST = route(async (req) => {
  const user = await requireRole(req, ["owner_admin", "barista"]);
  const body = await readJson(req, CreateStockTransactionRequestSchema);
  return jsonResponse(await createStockTransaction(user, body), {
    status: 201,
  });
});
