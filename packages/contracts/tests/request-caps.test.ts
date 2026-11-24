import { describe, expect, it } from "vitest";
import {
  CreateOrderRequestSchema,
  IngredientListQuerySchema,
  OrderListQuerySchema,
  SyncPayloadSchema,
} from "../src";

// Why: zod 3.25.76 has a high advisory (memory exhaustion on oversized collections), and every
// request reaches a paid function. The caps sit far above a real café order, so a hit is abuse.
const tooBig = (r: { success: boolean; error?: { issues: { code: string; path: unknown[] }[] } }, path: unknown[]) =>
  !r.success && r.error!.issues.some((i) => i.code === "too_big" && JSON.stringify(i.path) === JSON.stringify(path));

describe("request size caps", () => {
  it("caps an order at 500 rows", () => {
    expect(tooBig(CreateOrderRequestSchema.safeParse({ items: Array(501).fill({}) }), ["items"])).toBe(true);
    expect(tooBig(CreateOrderRequestSchema.safeParse({ items: Array(500).fill({}) }), ["items"])).toBe(false);
  });

  it("caps order notes at 500 characters", () => {
    expect(tooBig(CreateOrderRequestSchema.safeParse({ notes: "x".repeat(501) }), ["notes"])).toBe(true);
    expect(tooBig(CreateOrderRequestSchema.safeParse({ notes: "x".repeat(500) }), ["notes"])).toBe(false);
  });

  it("caps an offline sync batch at 100 orders", () => {
    expect(tooBig(SyncPayloadSchema.safeParse({ orders: Array(101).fill({}) }), ["orders"])).toBe(true);
    expect(tooBig(SyncPayloadSchema.safeParse({ orders: Array(100).fill({}) }), ["orders"])).toBe(false);
  });

  it("caps comma-list status filters at 10", () => {
    const many = (v: string) => Array(11).fill(v).join(",");
    expect(OrderListQuerySchema.safeParse({ status: many("pending") }).success).toBe(false);
    expect(OrderListQuerySchema.safeParse({ status: "pending,preparing" }).success).toBe(true);
    expect(IngredientListQuerySchema.safeParse({ stockStatus: many("low-stock") }).success).toBe(false);
  });
});
