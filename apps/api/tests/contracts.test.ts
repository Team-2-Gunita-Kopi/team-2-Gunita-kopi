import { describe, it, expect } from "vitest";
import {
  RoleSchema,
  OrderStatusSchema,
  OrderTypeSchema,
  CreateOrderRequestSchema,
  SyncPayloadSchema,
} from "@gunita/contracts";

describe("Contracts Schema Validation", () => {
  it("validates only allowed roles", () => {
    expect(RoleSchema.safeParse("owner_admin").success).toBe(true);
    expect(RoleSchema.safeParse("barista").success).toBe(true);
    expect(RoleSchema.safeParse("customer").success).toBe(false);
    expect(RoleSchema.safeParse("admin").success).toBe(false);
  });

  it("validates exact four order statuses", () => {
    const validStatuses = ["pending", "preparing", "completed", "cancelled"];
    validStatuses.forEach((status) => {
      expect(OrderStatusSchema.safeParse(status).success).toBe(true);
    });
    expect(OrderStatusSchema.safeParse("delivered").success).toBe(false);
  });

  it("validates exactly the order types the orders table accepts", () => {
    // Online/Facebook orders are entered as pre-orders (FR-01); orders.order_type has no 'online'.
    const validTypes = ["dine-in", "take-out", "pre-order"];
    validTypes.forEach((type) => {
      expect(OrderTypeSchema.safeParse(type).success).toBe(true);
    });
    expect(OrderTypeSchema.safeParse("online").success).toBe(false);
    expect(OrderTypeSchema.safeParse("delivery").success).toBe(false);
  });

  it("requires clientTxId in CreateOrderRequest for idempotency", () => {
    const orderData = {
      clientTxId: "3f2b8c1e-5d4a-4b6f-8e9c-0a1b2c3d4e5f",
      type: "dine-in",
      items: [
        {
          productId: "prod_1",
          productName: "Spanish Latte",
          quantity: 2,
          unitPrice: 140,
          subtotal: 280,
        },
      ],
      totalAmount: 280,
      paidAmount: 280,
      paymentMethod: "cash",
    };

    expect(CreateOrderRequestSchema.safeParse(orderData).success).toBe(true);

    const missingTx = { ...orderData, clientTxId: "" };
    expect(CreateOrderRequestSchema.safeParse(missingTx).success).toBe(false);

    const notUuid = { ...orderData, clientTxId: "tx_xyz_999" };
    expect(CreateOrderRequestSchema.safeParse(notUuid).success).toBe(false);
  });

  it("requires ingredientId on add-on rows and productId on product rows", () => {
    const base = {
      clientTxId: "3f2b8c1e-5d4a-4b6f-8e9c-0a1b2c3d4e5f",
      type: "dine-in",
      totalAmount: 20,
      paidAmount: 20,
      paymentMethod: "cash",
    };
    const addon = {
      productName: "Extra shot",
      quantity: 1,
      unitPrice: 20,
      subtotal: 20,
    };

    expect(
      CreateOrderRequestSchema.safeParse({
        ...base,
        items: [{ ...addon, isAddon: true, ingredientId: "4" }],
      }).success,
    ).toBe(true);
    expect(
      CreateOrderRequestSchema.safeParse({
        ...base,
        items: [{ ...addon, isAddon: true }],
      }).success,
    ).toBe(false);
    expect(
      CreateOrderRequestSchema.safeParse({ ...base, items: [{ ...addon }] })
        .success,
    ).toBe(false);
  });

  it("validates offline sync payload with transactionId", () => {
    const syncPayload = {
      batchId: "batch_123",
      orders: [
        {
          transactionId: "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a",
          order: {
            clientTxId: "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a",
            type: "take-out",
            items: [
              {
                productId: "p1",
                productName: "Americano",
                quantity: 1,
                unitPrice: 100,
                subtotal: 100,
              },
            ],
            totalAmount: 100,
            paidAmount: 100,
            paymentMethod: "card",
          },
          createdAt: new Date().toISOString(),
        },
      ],
    };

    expect(SyncPayloadSchema.safeParse(syncPayload).success).toBe(true);
  });
});

describe("Username sign-in", () => {
  it("normalizes usernames and rejects ones that cannot form an email", async () => {
    const { UsernameSchema } = await import("@gunita/contracts");
    const { usernameToAuthEmail } = await import("@gunita/auth");
    expect(UsernameSchema.parse(" Bea.Cruz ")).toBe("bea.cruz");
    expect(UsernameSchema.safeParse("bea cruz").success).toBe(false);
    expect(UsernameSchema.safeParse("ab").success).toBe(false);
    expect(usernameToAuthEmail(" Bea.Cruz ")).toBe(
      "bea.cruz@staff.gunitakopi.local",
    );
  });
});
