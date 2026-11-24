import { describe, expect, it } from "vitest";
import { createState, MockError } from "@/mocks/store/state";
import { createStockTransaction, listIngredients, listStockTransactions } from "@/mocks/store/stock";
import { NOW, USER, stockOf } from "./helpers";

describe("stock operations", () => {
  it("stock_out beyond current stock throws", () => {
    const s = createState("pos", NOW);
    const cur = stockOf(s, "i-beans");
    const call = () =>
      createStockTransaction(s, { ingredientId: "i-beans", type: "stock_out", quantityChange: cur + 1 }, USER, NOW);
    expect(call).toThrow("Cannot remove more than current stock.");
    expect(call).toThrow(MockError);
    expect(stockOf(s, "i-beans")).toBe(cur);
  });

  it("requires a positive quantity for stock_in", () => {
    const s = createState("pos", NOW);
    expect(() =>
      createStockTransaction(s, { ingredientId: "i-beans", type: "stock_in", quantityChange: 0 }, USER, NOW),
    ).toThrow(MockError);
  });

  it("stock_in raises stock and records previous/new", () => {
    const s = createState("pos", NOW);
    const cur = stockOf(s, "i-beans");
    const tx = createStockTransaction(
      s,
      { ingredientId: "i-beans", type: "stock_in", quantityChange: 500, reason: "Delivery" },
      USER,
      NOW,
    );
    expect(stockOf(s, "i-beans")).toBe(cur + 500);
    expect(tx).toMatchObject({ previousStock: cur, newStock: cur + 500, quantityChange: 500, createdBy: "Juan Dela Cruz" });
    expect(s.ingredients.find((i) => i.id === "i-beans")!.updatedAt).toBe(NOW.toISOString());
    expect(listStockTransactions(s, { ingredientId: "i-beans", type: "stock_in" })[0]?.id).toBe(tx.id);
    expect(new Set(s.stockTx.map((t) => t.id)).size).toBe(s.stockTx.length);
  });

  it("waste records a negative change", () => {
    const s = createState("pos", NOW);
    const cur = stockOf(s, "i-beans");
    const tx = createStockTransaction(s, { ingredientId: "i-beans", type: "waste", quantityChange: 100 }, USER, NOW);
    expect(tx.quantityChange).toBe(-100);
    expect(stockOf(s, "i-beans")).toBe(cur - 100);
  });

  it("listIngredients puts out/low stock first", () => {
    const s = createState("pos", NOW);
    s.ingredients.find((i) => i.id === "i-milk")!.currentStock = 0;
    expect(listIngredients(s)[0]?.id).toBe("i-milk");
  });
});
