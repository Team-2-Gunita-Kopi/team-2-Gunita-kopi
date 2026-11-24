import { describe, expect, it } from "vitest";
import {
  addLine,
  computeChange,
  lineTotal,
  orderTotal,
  parseAmount,
  toOrderItems,
  type CartLine,
} from "@/contracts/ui";

const latte = { id: "p1", name: "Iced Spanish Latte", category: "Coffee", sellingPrice: 145 };
const counter = () => {
  let n = 0;
  return () => `l${++n}`;
};

describe("addLine", () => {
  it("increments an existing plain line of the same product", () => {
    const mk = counter();
    const lines = addLine(addLine([], latte, mk), latte, mk);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.quantity).toBe(2);
  });

  it("appends a new line once the existing one has an addon", () => {
    const mk = counter();
    let lines = addLine([], latte, mk);
    lines = [
      {
        ...lines[0]!,
        addons: [{ ingredientId: "i1", label: "Extra shot", quantity: 1, price: 25 }],
      },
    ];
    lines = addLine(lines, latte, mk);
    expect(lines).toHaveLength(2);
    expect(lines[1]!.addons).toEqual([]);
  });
});

describe("totals", () => {
  const line: CartLine = {
    lineId: "l1",
    productId: "p1",
    productName: "Iced Spanish Latte",
    category: "Coffee",
    unitPrice: 145,
    quantity: 2,
    addons: [{ ingredientId: "i1", label: "Extra shot", quantity: 1, price: 25 }],
    customization: "",
    specialInstructions: "",
  };
  it("computes line and order totals", () => {
    expect(lineTotal(line)).toBe(340);
    expect(orderTotal([line, line])).toBe(680);
  });
  it("maps to order items", () => {
    expect(toOrderItems([line])[0]).toMatchObject({ productId: "p1", quantity: 2, subtotal: 340 });
  });
});

describe("payment", () => {
  it("computes change", () => {
    expect(computeChange(340, 500)).toEqual({ ok: true, change: 160 });
    expect(computeChange(340, 339.99)).toEqual({
      ok: false,
      error: "Amount paid is less than the total.",
    });
    expect(computeChange(0.1 + 0.2, 0.3)).toEqual({ ok: true, change: 0 });
  });
  it("never returns negative zero", () => {
    const r = computeChange(0.1 + 0.2, 0.3);
    expect(r.ok && Object.is(r.change, 0)).toBe(true);
  });
  it("rejects non-finite amounts", () => {
    const err = { ok: false, error: "Amount paid is less than the total." };
    expect(computeChange(100, NaN)).toEqual(err);
    expect(computeChange(NaN, 100)).toEqual(err);
    expect(computeChange(100, Infinity)).toEqual(err);
    expect(computeChange(Infinity, 100)).toEqual(err);
  });
  it("parses amounts", () => {
    expect(parseAmount("1,000.50")).toBe(1000.5);
    expect(parseAmount(" 200 ")).toBe(200);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("-5")).toBeNull();
  });
});
