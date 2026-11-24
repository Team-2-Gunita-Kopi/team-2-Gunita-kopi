import { describe, expect, it } from "vitest";
import { STOCK_STATUS_LABEL, sortByStockUrgency, stockStatus } from "@/contracts/ui";

describe("stockStatus", () => {
  it("classifies stock levels", () => {
    expect(stockStatus(0, 10)).toBe("out_of_stock");
    expect(stockStatus(-1, 10)).toBe("out_of_stock");
    expect(stockStatus(10, 10)).toBe("low");
    expect(stockStatus(10.5, 10)).toBe("ok");
  });
  it("has labels", () => {
    expect(STOCK_STATUS_LABEL).toEqual({ ok: "In Stock", low: "Low", out_of_stock: "Out" });
  });
});

describe("sortByStockUrgency", () => {
  it("orders out, low, ok with name asc inside groups", () => {
    const items = [
      { name: "Z ok", currentStock: 50, minimumStock: 10 },
      { name: "B low", currentStock: 5, minimumStock: 10 },
      { name: "A low", currentStock: 10, minimumStock: 10 },
      { name: "C out", currentStock: 0, minimumStock: 10 },
      { name: "A ok", currentStock: 20, minimumStock: 10 },
    ];
    expect(sortByStockUrgency(items).map((i) => i.name)).toEqual([
      "C out", "A low", "B low", "A ok", "Z ok",
    ]);
    expect(items[0]!.name).toBe("Z ok");
  });
});
