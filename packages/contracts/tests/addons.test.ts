import { describe, expect, it } from "vitest";
import {
  ADDON_DRINK_CATEGORIES,
  ADDON_SELLING_PRICE,
  CreateBaristaIngredientRequestSchema,
  CreateIngredientRequestSchema,
  IngredientSchema,
  UpdateIngredientRequestSchema,
} from "../src";
import { inventoryAddons } from "../src/ui";

describe("ingredient add-on configuration (contracts)", () => {
  it("fixes the add-on price at PHP 25.00 and offers add-ons for drinks only", () => {
    expect(ADDON_SELLING_PRICE).toBe(25);
    expect(ADDON_DRINK_CATEGORIES).toEqual(["Iced Coffee", "Non-Coffee"]);
  });

  it("defaults new ingredients to regular (not an add-on)", () => {
    const r = CreateIngredientRequestSchema.parse({ name: "Rice" });
    expect(r.isAddon).toBe(false);
    expect(r.addonQuantity).toBeUndefined();
  });

  it("allows Baristas to assign an existing supplier without Owner-only fields", () => {
    expect(
      CreateBaristaIngredientRequestSchema.parse({
        name: "Rice",
        unit: "g",
        supplierId: 6,
        reorderLevel: 20,
        openingStock: 300,
      }),
    ).toEqual({
      name: "Rice",
      unit: "g",
      supplierId: 6,
      reorderLevel: 20,
      openingStock: 300,
    });
    for (const privilegedField of [
      { supplierName: "Not an existing supplier" },
      { unitCost: 1.25 },
      { isAddon: true, addonQuantity: 10 },
    ]) {
      expect(
        CreateBaristaIngredientRequestSchema.safeParse({
          name: "Rice",
          ...privilegedField,
        }).success,
      ).toBe(false);
    }
  });

  it("requires a positive quantity for an add-on, and none for a regular ingredient", () => {
    expect(CreateIngredientRequestSchema.safeParse({ name: "Beans", isAddon: true, addonQuantity: 18 }).success).toBe(true);
    for (const bad of [
      { name: "Beans", isAddon: true },
      { name: "Beans", isAddon: true, addonQuantity: null },
      { name: "Beans", isAddon: true, addonQuantity: 0 },
      { name: "Beans", isAddon: true, addonQuantity: -1 },
      { name: "Beans", isAddon: false, addonQuantity: 5 },
    ]) {
      expect(CreateIngredientRequestSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it("never accepts a selling price from the client", () => {
    const r = CreateIngredientRequestSchema.parse({ name: "Beans", isAddon: true, addonQuantity: 18, addonSellingPrice: 30 });
    expect(r).not.toHaveProperty("addonSellingPrice");
  });

  it("lets an update leave the add-on configuration alone, or switch it off", () => {
    const keep = UpdateIngredientRequestSchema.parse({ name: "Beans" });
    expect(keep).not.toHaveProperty("isAddon");
    expect(UpdateIngredientRequestSchema.safeParse({ isAddon: false, addonQuantity: null }).success).toBe(true);
    expect(UpdateIngredientRequestSchema.safeParse({ addonQuantity: 12 }).success).toBe(false);
  });

  it("allows ingredient responses without unitCost (Barista)", () => {
    const row = {
      id: 1, name: "Milk", unit: "ml", currentStock: 1, reorderLevel: 0, stockStatus: "available",
      supplierId: null, supplierName: null, updatedAt: "x", isAddon: false, addonSellingPrice: null, addonQuantity: null,
    };
    expect(IngredientSchema.safeParse(row).success).toBe(true);
    expect(IngredientSchema.safeParse({ ...row, unitCost: 0.1 }).success).toBe(true);
  });
});

describe("inventoryAddons (real-mode POS add-on list)", () => {
  const list = inventoryAddons([
    { id: "21", name: "Espresso Beans", currentStock: 18, addon: { price: 25, quantity: 18 } },
    { id: "22", name: "Caramel Sauce", currentStock: 14.99, addon: { price: 25, quantity: 15 } },
    { id: "23", name: "Rice", currentStock: 1000 },
  ]);

  it("lists only configured add-ons as one selection at their price", () => {
    expect(list.map((a) => [a.ingredientId, a.label, a.quantity, a.price])).toEqual([
      ["21", "Espresso Beans", 1, 25],
      ["22", "Caramel Sauce", 1, 25],
    ]);
  });

  it("disables an add-on when less than one selection is in stock", () => {
    expect(list.map((a) => a.disabled)).toEqual([false, true]);
  });
});
