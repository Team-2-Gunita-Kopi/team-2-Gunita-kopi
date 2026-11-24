import { beforeEach, describe, expect, it } from "vitest";
import { orderTotal, type PosProduct } from "@/contracts/ui";
import { selectCount, selectTotal, useCartStore } from "@/staff/features/pos/cart.store";

const latte = { id: "p1", name: "Latte", category: "Hot Beverages", sellingPrice: 120 } as PosProduct;
const mocha = { id: "p2", name: "Mocha", category: "Hot Beverages", sellingPrice: 135.5 } as PosProduct;

const state = () => useCartStore.getState();

beforeEach(() => state().clear());

describe("cart store", () => {
  it("adding the same product twice gives one line with quantity 2", () => {
    state().add(latte);
    state().add(latte);
    expect(state().lines).toHaveLength(1);
    expect(state().lines[0]).toMatchObject({ productId: "p1", quantity: 2, unitPrice: 120 });
  });

  it("a customised line is not merged with a later plain add", () => {
    state().add(latte);
    state().updateLine(state().lines[0]!.lineId, { addons: [{ ingredientId: "i1", label: "Extra shot", quantity: 1, price: 20 }] });
    state().add(latte);
    expect(state().lines).toHaveLength(2);
  });

  it("increment, decrement and remove", () => {
    state().add(latte);
    const id = state().lines[0]!.lineId;
    state().increment(id);
    expect(state().lines[0]!.quantity).toBe(2);
    state().decrement(id);
    expect(state().lines[0]!.quantity).toBe(1);
    state().decrement(id);
    expect(state().lines).toHaveLength(0);
    state().add(mocha);
    state().remove(state().lines[0]!.lineId);
    expect(state().lines).toHaveLength(0);
  });

  it("selectTotal equals orderTotal and selectCount sums quantities", () => {
    state().add(latte);
    state().add(latte);
    state().add(mocha);
    state().updateLine(state().lines[1]!.lineId, { addons: [{ ingredientId: "i2", label: "Oat milk", quantity: 1, price: 15.25 }], customization: "less ice" });
    expect(selectTotal(state())).toBe(orderTotal(state().lines));
    expect(selectTotal(state())).toBe(390.75);
    expect(selectCount(state())).toBe(3);
  });

  it("clear empties the cart", () => {
    state().add(latte);
    state().clear();
    expect(state().lines).toEqual([]);
  });
});
