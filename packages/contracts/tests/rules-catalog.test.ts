import { describe, expect, it } from "vitest";
import { ADDON_CATALOG, PRODUCT_CATEGORIES, QUICK_CHIPS, addonsFor, isOrderable } from "../src";

const beans = [{ ingredientId: "i-beans", quantity: 18 }];

describe("isOrderable", () => {
  it("inactive is unavailable", () => {
    expect(isOrderable({ isActive: false }, beans, { "i-beans": 100 })).toEqual({
      orderable: false,
      reason: "unavailable",
    });
  });
  it("short ingredient is out_of_stock", () => {
    expect(isOrderable({ isActive: true }, beans, { "i-beans": 17 })).toEqual({
      orderable: false,
      reason: "out_of_stock",
    });
  });
  it("exact stock is orderable", () => {
    expect(isOrderable({ isActive: true }, beans, { "i-beans": 18 }).orderable).toBe(true);
  });
  it("missing ingredient counts as 0", () => {
    expect(isOrderable({ isActive: true }, beans, {}).reason).toBe("out_of_stock");
  });
});

describe("addonsFor", () => {
  it("excludes extra shot without beans but includes extra milk", () => {
    const ids = addonsFor("Hot Beverages", [{ ingredientId: "i-tablea", quantity: 40 }], {}).map(
      (a) => a.ingredientId,
    );
    expect(ids).not.toContain("i-beans");
    expect(ids).toContain("i-milk");
  });
  it("disables add-ons with insufficient stock", () => {
    const list = addonsFor("Iced Coffee Drinks", beans, { "i-caramel": 10, "i-beans": 100 });
    expect(list.find((a) => a.ingredientId === "i-caramel")?.disabled).toBe(true);
    expect(list.find((a) => a.ingredientId === "i-beans")?.disabled).toBe(false);
  });
  it("returns [] for pastries", () => {
    expect(addonsFor("Pastries & Snacks", beans, {})).toEqual([]);
  });
});

describe("constants", () => {
  it("has categories, catalog and chips", () => {
    expect(PRODUCT_CATEGORIES).toEqual([
      "Iced Coffee Drinks", "Hot Beverages", "Pastries & Snacks", "Rice Meals",
    ]);
    expect(ADDON_CATALOG).toHaveLength(7);
    expect(QUICK_CHIPS["Pastries & Snacks"]).toEqual(["Heated", "Sliced"]);
  });
});
