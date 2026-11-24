// Types and constants only: apps/pos imports this with `import type` (and POS_OPS is plain strings),
// so nothing here may import seed or store modules at runtime.
import type {
  CreateOrderRequest,
  CreateStockTransactionRequest,
  Order,
  OrderFilters,
  PosIngredient,
  PosProduct,
  StockTransaction,
  StockTransactionType,
  SyncPayload,
  SyncResponse,
  UserProfile,
} from "@gunita/contracts/ui";
import type { MockSettings } from "./seed/catalog";

export type { MockSettings };

export type MockActor = { id: string; fullName: string };

export interface PosMockDb {
  listCatalog(): { products: PosProduct[]; ingredients: PosIngredient[]; settings: MockSettings; updatedAt: string };
  listOrders(filters: OrderFilters): Order[];
  getOrder(id: string): Order;
  placeOrder(req: CreateOrderRequest, actor: MockActor): Order;
  advanceOrder(id: string): Order;
  cancelOrder(id: string, actor: MockActor): Order;
  listIngredients(): PosIngredient[];
  createStockTransaction(req: CreateStockTransactionRequest, actor: MockActor): StockTransaction;
  listStockTransactions(filters: { ingredientId?: string; type?: StockTransactionType; date?: string }): StockTransaction[];
  syncOrders(payload: SyncPayload, actor: MockActor): SyncResponse;
  authenticate(identifier: string, password: string): UserProfile | null;
  reset(): void;
}

export const POS_OPS = [
  "listCatalog",
  "listOrders",
  "getOrder",
  "placeOrder",
  "advanceOrder",
  "cancelOrder",
  "listIngredients",
  "createStockTransaction",
  "listStockTransactions",
  "syncOrders",
  "authenticate",
  "reset",
] as const satisfies readonly (keyof PosMockDb)[];
