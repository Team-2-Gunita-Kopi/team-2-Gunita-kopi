// @vitest-environment node
import { describe, expect, it, vi, afterEach } from "vitest";
import {
  CreateOrderRequestSchema as ApiCreateOrderRequestSchema,
  OrderSchema as ApiOrderSchema,
  SyncPayloadSchema as ApiSyncPayloadSchema,
  type Order as ApiOrder,
} from "@/contracts";
import {
  OrderSchema as UiOrderSchema,
  PosIngredientSchema,
  PosProductSchema,
  itemTotal,
  toOrderItems,
  type CartLine,
  type CreateOrderRequest as UiCreateOrderRequest,
} from "@/contracts/ui";
import {
  UnmappableOrderError,
  toApiOrder,
  toPosIngredient,
  toPosProduct,
  toUiOrder,
  toUiSyncResult,
} from "@/staff/features/pos/api-mappers";

const TX = "7b0d6a4c-4f2e-4a8e-9a55-3d1f0c2b9e11";

const line = (over: Partial<CartLine> = {}): CartLine => ({
  lineId: "l1",
  productId: "12",
  productName: "Spanish Latte",
  category: "Iced Coffee Drinks",
  unitPrice: 140,
  quantity: 2,
  addons: [],
  customization: "Sugar 50%",
  specialInstructions: "",
  ...over,
});

const uiOrder = (lines: CartLine[], over: Partial<UiCreateOrderRequest> = {}): UiCreateOrderRequest => ({
  clientTxId: TX,
  type: "dine-in",
  items: toOrderItems(lines),
  totalAmount: 0,
  taxAmount: 0,
  discountAmount: 0,
  paidAmount: 500,
  paymentMethod: "cash",
  ...over,
});

describe("POS order to API checkout rows (FR-02, FR-03)", () => {
  it("produces a body the API accepts, with product and add-on rows", () => {
    const order = uiOrder([
      line({ addons: [{ ingredientId: "7", label: "Vanilla syrup", quantity: 1, price: 25 }] }),
    ]);
    const api = toApiOrder(order);
    expect(ApiCreateOrderRequestSchema.safeParse(api).success).toBe(true);
    expect(api.items).toEqual([
      expect.objectContaining({ productId: "12", quantity: 2, unitPrice: 140, subtotal: 280, customization: "Sugar 50%" }),
      expect.objectContaining({ isAddon: true, ingredientId: "7", quantity: 2, unitPrice: 25, subtotal: 50 }),
    ]);
    expect(api.paymentMethod).toBe("cash");
  });

  it("sends one Iced Spanish Latte with two add-ons as three rows totalling PHP 195", () => {
    const api = toApiOrder(
      uiOrder([
        line({
          productName: "Iced Spanish Latte",
          unitPrice: 145,
          quantity: 1,
          addons: [
            { ingredientId: "21", label: "Espresso Extra Shots", quantity: 1, price: 25 },
            { ingredientId: "22", label: "Caramel", quantity: 1, price: 25 },
          ],
        }),
      ]),
    );
    expect(api.items.map((i) => [i.isAddon ?? false, i.ingredientId ?? i.productId, i.quantity, i.unitPrice, i.subtotal])).toEqual([
      [false, "12", 1, 145, 145],
      [true, "21", 1, 25, 25],
      [true, "22", 1, 25, 25],
    ]);
    expect(api.items.reduce((s, i) => s + i.subtotal, 0)).toBe(195);
  });

  it("counts add-on selections by the item quantity (3 drinks with an extra shot = 3 selections)", () => {
    const api = toApiOrder(
      uiOrder([line({ quantity: 3, addons: [{ ingredientId: "21", label: "Espresso Extra Shots", quantity: 1, price: 25 }] })]),
    );
    expect(api.items[1]).toMatchObject({ quantity: 3, unitPrice: 25, subtotal: 75 });
  });

  it("enters online orders as pre-orders (FR-01, orders.order_type)", () => {
    expect(toApiOrder(uiOrder([line()], { type: "online" })).type).toBe("pre-order");
  });

  it("builds a sync payload the API accepts", () => {
    const payload = {
      batchId: "b1",
      orders: [{ transactionId: TX, order: toApiOrder(uiOrder([line()])), createdAt: new Date().toISOString() }],
    };
    expect(ApiSyncPayloadSchema.safeParse(payload).success).toBe(true);
  });

  it("refuses demo ids instead of sending rows the database cannot link", () => {
    expect(() => toApiOrder(uiOrder([line({ productId: "p-latte" })]))).toThrow(UnmappableOrderError);
    expect(() =>
      toApiOrder(uiOrder([line({ addons: [{ ingredientId: "i-beans", label: "Extra shot", quantity: 18, price: 25 }] })])),
    ).toThrow(/not linked to an inventory ingredient/);
    // The old static demo add-on menu (ADDON_CATALOG) uses demo ids, so it can never reach the database.
  });
});

describe("API sync results to the outbox (FR-59, FR-60)", () => {
  it("keeps the server queue number for synced and duplicate orders", () => {
    expect(toUiSyncResult({ transactionId: TX, orderId: "41", status: "synced" })).toMatchObject({
      status: "synced",
      orderNumber: "41",
    });
    expect(toUiSyncResult({ transactionId: TX, orderId: "41", status: "duplicate" }).status).toBe("duplicate");
  });

  it("shows stock and price conflicts to staff as failed orders with the server message", () => {
    expect(
      toUiSyncResult({ transactionId: TX, status: "conflict", code: "STOCK_CONFLICT", error: "not enough stock for Milk" }),
    ).toEqual({ transactionId: TX, orderId: undefined, orderNumber: undefined, status: "failed", error: "not enough stock for Milk" });
  });
});

const apiOrder: ApiOrder = {
  orderId: 41,
  clientTxId: TX,
  status: "pending",
  orderType: "take-out",
  orderDate: "2026-11-18T09:30:00.000Z",
  cashierId: 2,
  cashierName: "Bea",
  items: [
    { lineId: 1, productId: 12, ingredientId: null, isAddon: false, name: "Spanish Latte", quantity: 2, unitPrice: 140, subtotal: 280, customization: "Sugar 50%", specialInstructions: null },
    { lineId: 2, productId: null, ingredientId: 7, isAddon: true, name: "Vanilla syrup", quantity: 2, unitPrice: 15, subtotal: 30, customization: null, specialInstructions: null },
    { lineId: 3, productId: 15, ingredientId: null, isAddon: false, name: "Croissant", quantity: 1, unitPrice: 85, subtotal: 85, customization: null, specialInstructions: "Heated" },
  ],
  total: 395,
  payment: { amountPaid: 500, changeAmount: 105, paymentMethod: "cash", receivedBy: 2, dateTime: "2026-11-18T09:30:00.000Z" },
};

describe("API order to receipt (FR-04, FR-07, FR-08)", () => {
  it("rebuilds items with nested add-ons and keeps totals and payment", () => {
    expect(ApiOrderSchema.safeParse(apiOrder).success).toBe(true);
    const ui = toUiOrder(apiOrder);
    expect(UiOrderSchema.safeParse(ui).success).toBe(true);
    expect(ui).toMatchObject({
      id: "41",
      orderNumber: "41",
      type: "take-out",
      totalAmount: 395,
      paidAmount: 500,
      changeAmount: 105,
      cashierName: "Bea",
    });
    expect(ui.items).toHaveLength(2);
    expect(ui.items[0]!.addons).toEqual([{ ingredientId: "7", label: "Vanilla syrup", quantity: 1, price: 15 }]);
    // The receipt's own line math matches the database subtotals.
    expect(ui.items.map(itemTotal)).toEqual([310, 85]);
    expect(ui.items[1]!.specialInstructions).toBe("Heated");
  });
});

describe("API catalog to POS view models (FR-05, FR-14, FR-19)", () => {
  it("maps products, keeping only real URLs as images", () => {
    const p = toPosProduct({
      id: 12, name: "Spanish Latte", description: null, category: null, price: 140,
      isAvailable: true, image: "products/latte.png", createdBy: 1, createdAt: "2026-11-18T00:00:00Z",
    });
    expect(PosProductSchema.safeParse(p).success).toBe(true);
    expect(p).toMatchObject({ id: "12", category: "Uncategorized", sellingPrice: 140, isActive: true });
    expect(p.imageUrl).toBeUndefined();
  });

  it("maps images: stored files through the API proxy, URLs as they are, nothing else", () => {
    const base = {
      id: 12, name: "Latte", description: null, category: null, price: 140,
      isAvailable: true, createdBy: 1, createdAt: "2026-11-18T00:00:00Z",
    };
    const stored = toPosProduct({ ...base, image: "12/11111111-2222-4333-8444-555555555555.webp" });
    expect(stored.imageUrl).toBe("/staff/api/products/12/image?v=11111111-2222-4333-8444-555555555555.webp");
    expect(PosProductSchema.safeParse(stored).success).toBe(true);
    expect(toPosProduct({ ...base, image: "https://cdn.example.com/l.png" }).imageUrl).toBe(
      "https://cdn.example.com/l.png",
    );
    // Another product's file or an unsafe path is never served.
    for (const image of ["13/11111111-2222-4333-8444-555555555555.png", "12/../x.png", "javascript:alert(1)", null]) {
      expect(toPosProduct({ ...base, image }).imageUrl).toBeUndefined();
    }
  });

  it("maps ingredients with the database stock status", () => {
    const i = toPosIngredient({
      id: 7, name: "Milk", unit: "ml", currentStock: 400, reorderLevel: 500,
      stockStatus: "low-stock", supplierId: null, supplierName: null, updatedAt: "2026-11-18T00:00:00Z",
      isAddon: false, addonSellingPrice: null, addonQuantity: null,
    });
    expect(PosIngredientSchema.safeParse(i).success).toBe(true);
    expect(i).toMatchObject({ id: "7", minimumStock: 500, isLowStock: true });
    expect(i).not.toHaveProperty("addon");
    expect(i).not.toHaveProperty("unitCost");
  });

  it("marks only complete add-on configurations at the fixed price as add-ons", () => {
    const base = {
      id: 21, name: "Espresso Beans", unit: "g", currentStock: 200, reorderLevel: 20,
      stockStatus: "available" as const, supplierId: null, supplierName: null, updatedAt: "2026-11-18T00:00:00Z",
    };
    const ok = toPosIngredient({ ...base, isAddon: true, addonSellingPrice: 25, addonQuantity: 18 });
    expect(ok.addon).toEqual({ price: 25, quantity: 18 });
    expect(PosIngredientSchema.safeParse(ok).success).toBe(true);
    for (const bad of [
      { isAddon: true, addonSellingPrice: 15, addonQuantity: 18 },
      { isAddon: true, addonSellingPrice: 25, addonQuantity: null },
      { isAddon: true, addonSellingPrice: 25, addonQuantity: 0 },
      { isAddon: false, addonSellingPrice: null, addonQuantity: null },
    ]) {
      expect(toPosIngredient({ ...base, ...bad }).addon).toBeUndefined();
    }
  });
});

describe("Real POS data source", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("never sends orders that cannot be mapped, and sends the rest to POST /api/sync", async () => {
    const calls: { url: string; body: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, body: JSON.parse(String(init.body)) });
        return new Response(
          JSON.stringify({ success: true, data: { processedCount: 1, results: [{ transactionId: TX, orderId: "41", status: "synced" }] } }),
        );
      }),
    );
    const { data } = await import("@/staff/features/pos/api");
    const demoTx = "11111111-1111-4111-8111-111111111111";
    const res = await data.syncOrders(
      {
        orders: [
          { transactionId: TX, order: uiOrder([line()]), createdAt: "2026-11-18T09:00:00Z" },
          { transactionId: demoTx, order: uiOrder([line({ productId: "p-latte" })], { clientTxId: demoTx }), createdAt: "2026-11-18T09:00:00Z" },
        ],
      },
      { id: "u1", fullName: "Bea" },
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("/staff/api/sync");
    expect((calls[0]!.body as { orders: unknown[] }).orders).toHaveLength(1);
    expect(res.results).toEqual([
      expect.objectContaining({ transactionId: TX, status: "synced", orderNumber: "41" }),
      expect.objectContaining({ transactionId: demoTx, status: "failed" }),
    ]);
  });

  it("rejects responses that do not match the API contract", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: true, data: { orderId: "x" } }))));
    const { data } = await import("@/staff/features/pos/api");
    await expect(data.getOrder("41")).rejects.toThrow("Unexpected response from the server");
  });
});
