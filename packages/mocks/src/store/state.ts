import type { Order, PosIngredient, PosProduct, StockTransaction, Supplier } from "@gunita/contracts";
import { seedIngredients, seedProducts, seedSettings, type MockSettings } from "../seed/catalog";
import { seedOrders, seedStockTx } from "../seed/orders";
import {
  seedIngredientSuppliers,
  seedPackaging,
  seedSuppliers,
  seedUnitCosts,
  seedUsers,
  type MockUser,
} from "../seed/owner";
import { mulberry32, SEED_RNG } from "../seed/rng";

/** Minimal key/value store; deliberately not DOM `Storage` so it can be file-backed on the server. */
export interface StateStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type MockErrorCode = "NOT_FOUND" | "VALIDATION" | "INSUFFICIENT_STOCK" | "FORBIDDEN";

export class MockError extends Error {
  readonly code: MockErrorCode;
  constructor(code: MockErrorCode, message: string) {
    super(message);
    this.name = "MockError";
    this.code = code;
  }
}

export type MockState = {
  products: PosProduct[];
  ingredients: PosIngredient[];
  orders: Order[];
  stockTx: StockTransaction[];
  settings: MockSettings;
  queue: { day: string; seq: number };
  // Owner-only: never present in the POS projection.
  suppliers?: Supplier[];
  users?: MockUser[];
  unitCosts?: Record<string, number>;
  ingredientSuppliers?: Record<string, string>;
  packaging?: Record<string, number>;
};

export type StateKind = "owner" | "pos";

export function createState(kind: StateKind, now: Date): MockState {
  const products = seedProducts(now);
  const { orders, queue } = seedOrders(now, mulberry32(SEED_RNG));
  const state: MockState = {
    products,
    ingredients: seedIngredients(now),
    orders,
    stockTx: seedStockTx(now, orders),
    settings: seedSettings(),
    queue,
  };
  if (kind === "owner") {
    state.suppliers = seedSuppliers(now);
    state.users = seedUsers(now);
    state.unitCosts = seedUnitCosts();
    state.ingredientSuppliers = seedIngredientSuppliers();
    state.packaging = seedPackaging(products);
  }
  return state;
}

function looksValid(x: unknown, kind: StateKind): x is MockState {
  if (typeof x !== "object" || x === null) return false;
  const s = x as Record<string, unknown>;
  const arrays = ["products", "ingredients", "orders", "stockTx"];
  if (!arrays.every((k) => Array.isArray(s[k]))) return false;
  if (typeof s.settings !== "object" || s.settings === null) return false;
  const q = s.queue as { day?: unknown; seq?: unknown } | null;
  if (!q || typeof q.day !== "string" || typeof q.seq !== "number") return false;
  if (kind === "owner") {
    return Array.isArray(s.suppliers) && Array.isArray(s.users) && typeof s.unitCosts === "object" && s.unitCosts !== null;
  }
  return true;
}

export function loadState(storage: StateStorage | null, key: string, kind: StateKind, now: Date): MockState {
  try {
    const raw = storage?.getItem(key);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (looksValid(parsed, kind)) return parsed;
    }
  } catch {
    // corrupt JSON or unreadable storage: fall through and reseed
  }
  const fresh = createState(kind, now);
  saveState(storage, key, fresh);
  return fresh;
}

export function saveState(storage: StateStorage | null, key: string, state: MockState): void {
  try {
    storage?.setItem(key, JSON.stringify(state));
  } catch {
    // persistence is best-effort
  }
}

export type OwnerData = {
  suppliers: Supplier[];
  users: MockUser[];
  unitCosts: Record<string, number>;
  ingredientSuppliers: Record<string, string>;
  packaging: Record<string, number>;
};

/** The owner-only slices of state; throws if this is a POS projection. Missing maps are created lazily. */
export function ownerData(state: MockState): OwnerData {
  if (!state.suppliers || !state.users || !state.unitCosts) {
    throw new MockError("FORBIDDEN", "Owner data is not available in this state.");
  }
  state.ingredientSuppliers ??= {};
  state.packaging ??= {};
  return state as OwnerData & MockState;
}
