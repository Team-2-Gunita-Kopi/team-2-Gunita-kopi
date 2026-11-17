import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOCK_SESSION_COOKIE, encodeMockSession } from "@gunita/auth";
import { addLine, type CartLine } from "@gunita/contracts";
import { createOwnerMockDb, createPosView } from "@gunita/mocks/owner";
import { connectivityStore } from "@/lib/connectivity";
import { posDb } from "@/offline/db";
import { discardOrder, retryOrder, syncOutboxOrders } from "@/offline/sync";
import { checkout } from "@/features/pos/checkout";
import { posData } from "@/features/pos";

let view: Record<string, (...a: unknown[]) => unknown>;
let ops: string[];
let throwOnSync = false;
const cashier = { userId: "u-barista", role: "barista" as const, fullName: "Test Barista", username: "barista" };

async function lines(quantity = 1): Promise<CartLine[]> {
  const cat = await posData.getCatalog();
  const p = cat.products.find((x) => x.name.startsWith("Iced Spanish Latte"))!;
  return addLine([], p, () => "l1").map((l) => ({ ...l, quantity }));
}

const syncCalls = () => ops.filter((o) => o === "syncOrders").length;

beforeEach(async () => {
  connectivityStore.setState({ browserOnline: true, simulatedOffline: false });
  document.cookie = `${MOCK_SESSION_COOKIE}=${encodeMockSession(cashier)}; path=/`;
  await posDb.ordersOutbox.clear();
  await posDb.meta.clear();
  ops = [];
  throwOnSync = false;
  const db = createOwnerMockDb({ storage: null, now: () => new Date("2026-11-16T06:00:00Z") });
  view = createPosView(db) as unknown as Record<string, (...a: unknown[]) => unknown>;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      const { op, args } = JSON.parse(init.body) as { op: string; args: unknown[] };
      ops.push(op);
      if (op === "syncOrders" && throwOnSync) throw new Error("network down");
      return { json: async () => ({ ok: true, data: view[op]!(...args) ?? null }) } as Response;
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

async function offlineCheckout(quantity = 1, paid = 5000) {
  const l = await lines(quantity);
  connectivityStore.setState({ simulatedOffline: true });
  const { record } = await checkout({ lines: l, type: "dine-in", paid, cashier });
  connectivityStore.setState({ simulatedOffline: false });
  return record;
}

describe("outbox sync", () => {
  it("offline checkout then reconnect syncs exactly once and stores the real orderNumber", async () => {
    const record = await offlineCheckout();
    expect(record.status).toBe("pending");
    expect(record.provisionalNo).toMatch(/^OFF-/);
    expect(syncCalls()).toBe(0);

    await Promise.all([syncOutboxOrders(), syncOutboxOrders()]);
    await syncOutboxOrders();
    expect(syncCalls()).toBe(1);
    const saved = (await posDb.ordersOutbox.get(record.clientTxId))!;
    expect(saved.status).toBe("synced");
    expect(saved.orderNumber).toMatch(/^20261116-A-/);
  });

  it("a sync that throws leaves the record failed, never synced, and it is retried later", async () => {
    const record = await offlineCheckout();
    throwOnSync = true;
    await syncOutboxOrders();
    const failed = (await posDb.ordersOutbox.get(record.clientTxId))!;
    expect(failed.status).toBe("failed");
    expect(failed.errorMessage).toMatch(/reach/);
    throwOnSync = false;
    await syncOutboxOrders();
    expect((await posDb.ordersOutbox.get(record.clientTxId))!.status).toBe("synced");
  });

  it("a server failure keeps the reason; retryOrder resubmits; discardOrder removes it", async () => {
    const record = await offlineCheckout(9999, 99_999_999);
    await syncOutboxOrders();
    const failed = (await posDb.ordersOutbox.get(record.clientTxId))!;
    expect(failed.status).toBe("failed");
    expect(failed.errorMessage).toMatch(/Not enough/);

    // rejected orders are not resubmitted automatically
    const before = syncCalls();
    await syncOutboxOrders();
    expect(syncCalls()).toBe(before);

    await retryOrder(record.clientTxId);
    expect(syncCalls()).toBe(before + 1);
    const again = (await posDb.ordersOutbox.get(record.clientTxId))!;
    expect(again.status).toBe("failed");
    expect(again.errorMessage).toMatch(/Not enough/);

    await discardOrder(record.clientTxId);
    expect(await posDb.ordersOutbox.get(record.clientTxId)).toBeUndefined();
  });

  it("retryOrder syncs a previously rejected order once the cause is fixed", async () => {
    const record = await offlineCheckout(9999, 99_999_999);
    await syncOutboxOrders();
    expect((await posDb.ordersOutbox.get(record.clientTxId))!.status).toBe("failed");
    // shrink the order so the server accepts it
    const rec = (await posDb.ordersOutbox.get(record.clientTxId))!;
    const items = rec.order.items.map((i) => ({ ...i, quantity: 1, subtotal: i.unitPrice }));
    await posDb.ordersOutbox.update(record.clientTxId, {
      order: { ...rec.order, items, totalAmount: items.reduce((n, i) => n + i.subtotal, 0) },
    });
    await retryOrder(record.clientTxId);
    const done = (await posDb.ordersOutbox.get(record.clientTxId))!;
    expect(done.errorMessage).toBeUndefined();
    expect(done.status).toBe("synced");
    expect(done.orderNumber).toMatch(/^20261116-A-/);
  });

  it("a record left in syncing by an interrupted run is synced on the next run", async () => {
    const record = await offlineCheckout();
    await posDb.ordersOutbox.update(record.clientTxId, { status: "syncing" });
    await syncOutboxOrders();
    const done = (await posDb.ordersOutbox.get(record.clientTxId))!;
    expect(done.status).toBe("synced");
    expect(syncCalls()).toBe(1);
  });

  it("discardOrder only removes failed records", async () => {
    const record = await offlineCheckout();
    await discardOrder(record.clientTxId);
    expect(await posDb.ordersOutbox.get(record.clientTxId)).toBeDefined();
  });
});
