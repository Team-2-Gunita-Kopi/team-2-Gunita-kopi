import type {
  BestSellerItem,
  CreateEmployeeRequest,
  CreateIngredientRequest,
  CreateOrderRequest,
  CreateProductRequest,
  CreateStockTransactionRequest,
  CreateSupplierRequest,
  DailyReport,
  Ingredient,
  InventoryStatusItem,
  MonthlyReport,
  Order,
  OrderFilters,
  OwnerDashboard,
  Product,
  ProductCosting,
  RecipeIngredient,
  StockTransaction,
  StockTransactionType,
  Supplier,
  SyncPayload,
  SyncResponse,
  UpdateRecipeRequest,
  UserProfile,
} from "@/contracts/ui";
import type { MockActor, MockSettings } from "./pos";
import * as auth from "./store/auth";
import * as catalog from "./store/catalog";
import { advanceOrder, cancelOrder, getOrder, listOrders, placeOrder } from "./store/orders";
import * as owner from "./store/owner";
import * as reports from "./store/reports";
import { createState, loadState, MockError, saveState, type MockState, type StateStorage } from "./store/state";
import { createStockTransaction, listIngredients, listStockTransactions } from "./store/stock";
import { syncOrders } from "./store/sync";

export interface OwnerMockDb {
  // catalog
  listProducts(): Product[];
  getProduct(id: string): Product;
  createProduct(req: CreateProductRequest & { description?: string; isActive?: boolean }): Product;
  updateProduct(id: string, patch: catalog.ProductPatch): Product;
  setProductAvailability(id: string, isActive: boolean): Product;
  deleteProduct(id: string): void;
  getRecipe(productId: string): { ingredients: RecipeIngredient[]; packagingCost: number; costing: ProductCosting };
  saveRecipe(productId: string, req: UpdateRecipeRequest): ProductCosting;
  listOwnerIngredients(): Ingredient[];
  createIngredient(req: CreateIngredientRequest): Ingredient;
  updateIngredient(id: string, patch: catalog.IngredientPatch): Ingredient;
  productsUsingIngredient(id: string): { id: string; name: string }[];
  deleteIngredient(id: string): void;
  getSettings(): MockSettings;
  // orders
  listOrders(filters: OrderFilters): Order[];
  getOrder(id: string): Order;
  placeOrder(req: CreateOrderRequest, actor: MockActor): Order;
  advanceOrder(id: string): Order;
  cancelOrder(id: string, actor: MockActor): Order;
  // stock
  listIngredients(): Ingredient[];
  createStockTransaction(req: CreateStockTransactionRequest, actor: MockActor): StockTransaction;
  listStockTransactions(filters: { ingredientId?: string; type?: StockTransactionType; date?: string }): StockTransaction[];
  syncOrders(payload: SyncPayload, actor: MockActor): SyncResponse;
  // owner
  listSuppliers(): Supplier[];
  createSupplier(req: CreateSupplierRequest): Supplier;
  updateSupplier(id: string, patch: Partial<CreateSupplierRequest>): Supplier;
  setSupplierActive(id: string, isActive: boolean): Supplier;
  listUsers(): UserProfile[];
  createUser(req: CreateEmployeeRequest & { username: string }): UserProfile;
  updateUser(
    id: string,
    patch: { fullName?: string; role?: UserProfile["role"]; isActive?: boolean; password?: string },
    actor: MockActor,
  ): UserProfile;
  // reports
  dailySales(days?: number): DailyReport[];
  monthlySales(months?: number): MonthlyReport[];
  bestSellers(from: string, to: string): BestSellerItem[];
  stockStatusReport(): InventoryStatusItem[];
  getDashboard(): OwnerDashboard;
  // auth / lifecycle
  authenticate(identifier: string, password: string): UserProfile | null;
  requestPasswordRecovery(email: string): null;
  verifyRecoveryCode(email: string, code: string): true;
  resetPasswordWithCode(email: string, code: string, password: string): true;
  registerOwner(req: { fullName: string; email: string; username: string; password: string }): UserProfile;
  reset(): void;
}

export const OWNER_OPS = [
  "listProducts",
  "getProduct",
  "createProduct",
  "updateProduct",
  "setProductAvailability",
  "deleteProduct",
  "getRecipe",
  "saveRecipe",
  "listOwnerIngredients",
  "createIngredient",
  "updateIngredient",
  "productsUsingIngredient",
  "deleteIngredient",
  "getSettings",
  "listOrders",
  "getOrder",
  "placeOrder",
  "advanceOrder",
  "cancelOrder",
  "listIngredients",
  "createStockTransaction",
  "listStockTransactions",
  "syncOrders",
  "listSuppliers",
  "createSupplier",
  "updateSupplier",
  "setSupplierActive",
  "listUsers",
  "createUser",
  "updateUser",
  "dailySales",
  "monthlySales",
  "bestSellers",
  "stockStatusReport",
  "getDashboard",
  "authenticate",
  "requestPasswordRecovery",
  "verifyRecoveryCode",
  "resetPasswordWithCode",
  "registerOwner",
  "reset",
] as const satisfies readonly (keyof OwnerMockDb)[];

export function createOwnerMockDb(opts: {
  storage: StateStorage | null;
  key?: string;
  now?: () => Date;
}): OwnerMockDb {
  const key = opts.key ?? "gk-mock-v1";
  const now = opts.now ?? (() => new Date());
  let state: MockState = loadState(opts.storage, key, "owner", now());

  const read =
    <A extends unknown[], R>(fn: (s: MockState, ...a: A) => R) =>
    (...a: A): R =>
      fn(state, ...a);
  const write =
    <A extends unknown[], R>(fn: (s: MockState, ...a: A) => R) =>
    (...a: A): R => {
      const out = fn(state, ...a);
      saveState(opts.storage, key, state);
      return out;
    };

  return {
    listProducts: read(catalog.listProducts),
    getProduct: read(catalog.getProduct),
    createProduct: write((s, req: Parameters<OwnerMockDb["createProduct"]>[0]) => catalog.createProduct(s, req, now())),
    updateProduct: write(catalog.updateProduct),
    setProductAvailability: write(catalog.setProductAvailability),
    deleteProduct: write(catalog.deleteProduct),
    getRecipe: read(catalog.getRecipe),
    saveRecipe: write((s, id: string, req: UpdateRecipeRequest) => catalog.saveRecipe(s, id, req, now())),
    listOwnerIngredients: read(catalog.listOwnerIngredients),
    createIngredient: write((s, req: CreateIngredientRequest) => catalog.createIngredient(s, req, now())),
    updateIngredient: write((s, id: string, patch: catalog.IngredientPatch) =>
      catalog.updateIngredient(s, id, patch, now()),
    ),
    productsUsingIngredient: read(catalog.productsUsingIngredient),
    deleteIngredient: write(catalog.deleteIngredient),
    getSettings: read((s) => s.settings),
    listOrders: read(listOrders),
    getOrder: read(getOrder),
    placeOrder: write((s, req: CreateOrderRequest, actor: MockActor) => placeOrder(s, req, actor, now())),
    advanceOrder: write(advanceOrder),
    cancelOrder: write((s, id: string, actor: MockActor) => cancelOrder(s, id, actor, now())),
    listIngredients: read(listIngredients),
    createStockTransaction: write((s, req: CreateStockTransactionRequest, actor: MockActor) =>
      createStockTransaction(s, req, actor, now()),
    ),
    listStockTransactions: read(listStockTransactions),
    syncOrders: write((s, payload: SyncPayload, actor: MockActor) => syncOrders(s, payload, actor, now())),
    listSuppliers: read(owner.listSuppliers),
    createSupplier: write((s, req: CreateSupplierRequest) => owner.createSupplier(s, req, now())),
    updateSupplier: write(owner.updateSupplier),
    setSupplierActive: write(owner.setSupplierActive),
    listUsers: read(owner.listUsers),
    createUser: write((s, req: CreateEmployeeRequest & { username: string }) => owner.createUser(s, req, now())),
    updateUser: write((s, id: string, patch: Parameters<typeof owner.updateUser>[2], actor: MockActor) =>
      owner.updateUser(s, id, patch, actor.id),
    ),
    dailySales: read((s, days?: number) => reports.dailySales(s, days, now())),
    monthlySales: read((s, months?: number) => reports.monthlySales(s, months, now())),
    bestSellers: read(reports.bestSellers),
    stockStatusReport: read(reports.stockStatusReport),
    getDashboard: read((s) => reports.getDashboard(s, now())),
    authenticate: read(auth.authenticate),
    requestPasswordRecovery: write((s, email: string) => auth.requestPasswordRecovery(s, email, now())),
    verifyRecoveryCode: read((s, email: string, code: string) => auth.verifyRecoveryCode(s, email, code, now())),
    resetPasswordWithCode: write((s, email: string, code: string, password: string) =>
      auth.resetPasswordWithCode(s, email, code, password, now()),
    ),
    registerOwner: write((s, req: { fullName: string; email: string; username: string; password: string }) => {
      if (!auth.registrationOpen(s)) {
        throw new MockError("FORBIDDEN", "Registration is closed. Ask the Owner to create your account.");
      }
      return owner.createUser(s, { ...req, role: "owner_admin" }, now());
    }),
    reset() {
      state = createState("owner", now());
      saveState(opts.storage, key, state);
    },
  };
}
