import { describe, expect, it } from "vitest";
import {
  OrderItemSchema,
  OwnerDashboardSchema,
  PosIngredientSchema,
  PosProductSchema,
} from "../src/ui";

const baseItem = {
  productId: "p-1",
  productName: "Latte",
  quantity: 1,
  unitPrice: 120,
  subtotal: 120,
};

const product = {
  id: "p-1",
  name: "Latte",
  category: "Coffee",
  sellingPrice: 120,
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("contracts schemas", () => {
  it("order item accepts nested addons", () => {
    const item = OrderItemSchema.parse({
      ...baseItem,
      addons: [
        { ingredientId: "i-beans", label: "Extra shot", quantity: 18, price: 25 },
      ],
      customization: "Sugar 50%",
    });
    expect(item.addons?.[0].price).toBe(25);
    expect(item.customization).toBe("Sugar 50%");
  });

  it("old order item without new fields still parses", () => {
    const item = OrderItemSchema.parse(baseItem);
    expect(item.addons).toBeUndefined();
  });

  it("pos product schema strips cost fields", () => {
    const result = PosProductSchema.parse({
      ...product,
      costPrice: 40,
      profitMarginPercent: 60,
    });
    expect(result).not.toHaveProperty("costPrice");
    expect(result).not.toHaveProperty("profitMarginPercent");
  });

  it("pos ingredient schema strips unit cost and supplier", () => {
    const result = PosIngredientSchema.parse({
      id: "i-1",
      name: "Beans",
      unit: "g",
      currentStock: 100,
      minimumStock: 10,
      unitCost: 2,
      supplierId: "s-1",
      supplierName: "Acme",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result).not.toHaveProperty("unitCost");
    expect(result).not.toHaveProperty("supplierId");
    expect(result).not.toHaveProperty("supplierName");
  });

  it("owner dashboard schema parses fallback day", () => {
    const result = OwnerDashboardSchema.parse({
      date: "2026-01-01",
      isFallbackDay: true,
      sales: 0,
      ordersCount: 0,
      openOrdersCount: 0,
      topProducts: [],
      lowStock: [],
      recentOrders: [],
    });
    expect(result.isFallbackDay).toBe(true);
  });
});
