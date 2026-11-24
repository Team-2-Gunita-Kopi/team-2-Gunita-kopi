import { afterEach, describe, expect, it, vi } from "vitest";
import { toOrderItems, type CartLine, type CreateOrderRequest as UiCreateOrderRequest } from "@/contracts/ui";
import { MAX_ORDER_ITEMS, MAX_SYNC_ORDERS } from "@/contracts";
import { NextRequest } from "next/server";

afterEach(() => vi.unstubAllGlobals());

const line = (): CartLine => ({
  lineId: crypto.randomUUID(),
  productId: "12",
  productName: "Spanish Latte",
  category: "Iced Coffee Drinks",
  unitPrice: 140,
  quantity: 1,
  addons: [],
  customization: "",
  specialInstructions: "",
});
const order = (id: string, lines: CartLine[]): UiCreateOrderRequest => ({
  clientTxId: id,
  type: "dine-in",
  items: toOrderItems(lines),
  totalAmount: 0,
  taxAmount: 0,
  discountAmount: 0,
  paidAmount: 140 * lines.length,
  paymentMethod: "cash",
});

describe("offline sync batching", () => {
  // Why: a busy offline day can queue more orders than one /api/sync request accepts. Sending them
  // all at once would be refused on every retry, so no sale would ever reach the server.
  it("sends the queue in chunks the API accepts, and holds back an oversized order", async () => {
    const sizes: number[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const orders = (JSON.parse(String(init.body)) as { orders: { transactionId: string }[] }).orders;
        sizes.push(orders.length);
        return new Response(
          JSON.stringify({
            success: true,
            data: { processedCount: orders.length, results: orders.map((o, i) => ({ transactionId: o.transactionId, orderId: String(i + 1), status: "synced" })) },
          }),
        );
      }),
    );
    const { data } = await import("@/staff/features/pos/api");
    const ids = Array.from({ length: MAX_SYNC_ORDERS + 1 }, () => crypto.randomUUID());
    const big = crypto.randomUUID();
    const res = await data.syncOrders(
      {
        orders: [
          ...ids.map((id) => ({ transactionId: id, order: order(id, [line()]), createdAt: "2026-11-24T09:00:00Z" })),
          { transactionId: big, order: order(big, Array.from({ length: MAX_ORDER_ITEMS + 1 }, line)), createdAt: "2026-11-24T09:00:00Z" },
        ],
      },
      { id: "u1", fullName: "Bea" },
    );
    expect(sizes).toEqual([MAX_SYNC_ORDERS, 1]);
    expect(res.results.filter((r) => r.status === "synced")).toHaveLength(MAX_SYNC_ORDERS + 1);
    expect(res.results.find((r) => r.transactionId === big)).toMatchObject({ status: "failed" });
  });
});

describe("demo-mode middleware under /staff", () => {
  // Why: a signed-out barista must land on the POS sign-in, never the Owner's /login.
  it("redirects to /staff/login", async () => {
    const { middleware } = await import("@/middleware");
    const res = await middleware(new NextRequest("http://localhost/staff/orders"));
    expect(res.headers.get("location")).toBe("http://localhost/staff/login?redirect=%2Fstaff%2Forders");
  });
});

describe("offline sync isolation", () => {
  // Why: one order with a note over the API limit must not stop every other sale from syncing,
  // and orders saved by an earlier chunk must show as synced even if a later chunk fails.
  it("holds back an invalid order and keeps earlier chunks when a later one fails", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        call++;
        if (call === 2) throw new TypeError("Failed to fetch");
        const orders = (JSON.parse(String(init.body)) as { orders: { transactionId: string }[] }).orders;
        return new Response(
          JSON.stringify({
            success: true,
            data: { processedCount: orders.length, results: orders.map((o, i) => ({ transactionId: o.transactionId, orderId: String(i + 1), status: "synced" })) },
          }),
        );
      }),
    );
    const { data } = await import("@/staff/features/pos/api");
    const ids = Array.from({ length: MAX_SYNC_ORDERS + 1 }, () => crypto.randomUUID());
    const longNote = crypto.randomUUID();
    const noted = order(longNote, [{ ...line(), specialInstructions: "x".repeat(256) }]);
    const res = await data.syncOrders(
      {
        orders: [
          { transactionId: longNote, order: noted, createdAt: "2026-11-24T09:00:00Z" },
          ...ids.map((id) => ({ transactionId: id, order: order(id, [line()]), createdAt: "2026-11-24T09:00:00Z" })),
        ],
      },
      { id: "u1", fullName: "Bea" },
    );
    expect(res.results.find((r) => r.transactionId === longNote)).toMatchObject({ status: "failed" });
    expect(res.results.filter((r) => r.status === "synced")).toHaveLength(MAX_SYNC_ORDERS);
    expect(res.results.some((r) => r.transactionId === ids[MAX_SYNC_ORDERS])).toBe(false);
  });
});
