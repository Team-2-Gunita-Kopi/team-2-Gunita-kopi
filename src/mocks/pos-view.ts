import { PosIngredientSchema, PosProductSchema } from "@/contracts/ui";
import type { OwnerMockDb } from "./owner-db";
import type { PosMockDb } from "./pos";

const posProducts = (rows: unknown[]) => rows.map((r) => PosProductSchema.parse(r));
const posIngredients = (rows: unknown[]) => rows.map((r) => PosIngredientSchema.parse(r));

/** POS projection over the SAME state as `db`; owner-only fields are stripped from every result. */
export function createPosView(db: OwnerMockDb): PosMockDb {
  return {
    listCatalog: () => ({
      products: posProducts(db.listProducts()),
      ingredients: posIngredients(db.listIngredients()),
      settings: db.getSettings(),
      updatedAt: new Date().toISOString(),
    }),
    listOrders: (f) => db.listOrders(f),
    getOrder: (id) => db.getOrder(id),
    placeOrder: (req, actor) => db.placeOrder(req, actor),
    advanceOrder: (id) => db.advanceOrder(id),
    cancelOrder: (id, actor) => db.cancelOrder(id, actor),
    listIngredients: () => posIngredients(db.listIngredients()),
    createStockTransaction: (req, actor) => db.createStockTransaction(req, actor),
    listStockTransactions: (f) => db.listStockTransactions(f),
    syncOrders: (p, actor) => db.syncOrders(p, actor),
    authenticate: (i, p) => db.authenticate(i, p),
    reset: () => db.reset(),
  };
}
