import { sortByStockUrgency, round2 } from "@gunita/contracts";
import type {
  CreateStockTransactionRequest,
  Ingredient,
  StockTransaction,
  StockTransactionType,
} from "@gunita/contracts";
import { MockError, type MockState } from "./state";

export type Actor = { id: string; fullName: string };

export function localDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Newest first; ties keep later-inserted rows first. */
export function newestFirst<T extends { createdAt: string }>(rows: T[]): T[] {
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => b.r.createdAt.localeCompare(a.r.createdAt) || b.i - a.i)
    .map((x) => x.r);
}

function uniqueTxId(state: MockState, base: string): string {
  let id = base;
  for (let n = 2; state.stockTx.some((t) => t.id === id); n++) id = `${base}-${n}`;
  return id;
}

/** Applies a signed stock change and records the transaction. Caller has validated the change. */
export function applyStockChange(
  state: MockState,
  args: {
    ingredientId: string;
    type: StockTransactionType;
    change: number;
    reason?: string;
    referenceId?: string;
    createdBy: string;
    now: Date;
    idBase: string;
  },
): StockTransaction {
  const ing = state.ingredients.find((i) => i.id === args.ingredientId);
  if (!ing) throw new MockError("NOT_FOUND", "Ingredient not found.");
  const previousStock = ing.currentStock;
  const newStock = round2(previousStock + args.change);
  const at = args.now.toISOString();
  ing.currentStock = newStock;
  ing.updatedAt = at;
  ing.isLowStock = newStock <= ing.minimumStock;
  const tx: StockTransaction = {
    id: uniqueTxId(state, args.idBase),
    ingredientId: ing.id,
    ingredientName: ing.name,
    type: args.type,
    quantityChange: args.change,
    previousStock,
    newStock,
    reason: args.reason,
    createdAt: at,
    createdBy: args.createdBy,
  };
  if (args.referenceId !== undefined) tx.referenceId = args.referenceId;
  state.stockTx.push(tx);
  return tx;
}

export function listIngredients(state: MockState): Ingredient[] {
  return sortByStockUrgency(state.ingredients) as Ingredient[];
}

export function createStockTransaction(
  state: MockState,
  req: CreateStockTransactionRequest,
  user: Actor,
  now: Date,
): StockTransaction {
  const ing = state.ingredients.find((i) => i.id === req.ingredientId);
  if (!ing) throw new MockError("NOT_FOUND", "Ingredient not found.");
  let change = req.quantityChange;
  if (!Number.isFinite(change)) throw new MockError("VALIDATION", "Quantity must be a number.");
  if (req.type !== "adjustment") {
    if (!(change > 0)) throw new MockError("VALIDATION", "Quantity must be greater than zero.");
    if (req.type !== "stock_in") {
      if (change > ing.currentStock) {
        throw new MockError("VALIDATION", "Cannot remove more than current stock.");
      }
      change = -change;
    }
  } else if (ing.currentStock + change < 0) {
    throw new MockError("VALIDATION", "Cannot remove more than current stock.");
  }
  return applyStockChange(state, {
    ingredientId: ing.id,
    type: req.type,
    change,
    reason: req.reason,
    createdBy: user.fullName,
    now,
    idBase: `st-${now.getTime()}-${ing.id}`,
  });
}

export function listStockTransactions(
  state: MockState,
  f: { ingredientId?: string; type?: StockTransactionType; date?: string },
): StockTransaction[] {
  return newestFirst(
    state.stockTx.filter(
      (t) =>
        (!f.ingredientId || t.ingredientId === f.ingredientId) &&
        (!f.type || t.type === f.type) &&
        (!f.date || localDay(t.createdAt) === f.date),
    ),
  );
}
