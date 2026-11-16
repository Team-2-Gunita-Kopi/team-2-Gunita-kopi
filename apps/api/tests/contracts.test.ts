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

  it("validates exact four order types", () => {
    const validTypes = ["dine-in", "take-out", "online", "pre-order"];
    validTypes.forEach((type) => {
      expect(OrderTypeSchema.safeParse(type).success).toBe(true);
    });
    expect(OrderTypeSchema.safeParse("delivery").success).toBe(false);
  });

  it("requires clientTxId in CreateOrderRequest for idempotency", () => {
    const orderData = {
      clientTxId: "tx_xyz_999",
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
  });

  it("validates offline sync payload with transactionId", () => {
    const syncPayload = {
      batchId: "batch_123",
      orders: [
        {
          transactionId: "tx_001",
          order: {
            clientTxId: "tx_001",
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
