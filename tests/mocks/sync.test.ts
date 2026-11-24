import { describe, expect, it } from "vitest";
import { createState } from "@/mocks/store/state";
import { syncOrders } from "@/mocks/store/sync";
import { NOW, USER, line, req } from "./helpers";

describe("syncOrders", () => {
  it("syncing the same transaction twice returns duplicate", () => {
    const s = createState("pos", NOW);
    const order = req([line(s, "p-iced-spanish-latte", 1)], { clientTxId: "tx-9" });
    const payload = { orders: [{ transactionId: "tx-9", order, createdAt: NOW.toISOString() }] };
    const before = s.orders.length;
    const first = syncOrders(s, payload, USER, NOW);
    expect(first.results[0]?.status).toBe("synced");
    const second = syncOrders(s, payload, USER, NOW);
    expect(second.results[0]).toMatchObject({ status: "duplicate", orderId: first.results[0]?.orderId });
    expect(s.orders.length).toBe(before + 1);
  });

  it("keeps the offline createdAt on the order while stock rows use now", () => {
    const s = createState("pos", NOW);
    const t = new Date(2026, 10, 3, 9, 0, 0).toISOString();
    const order = req([line(s, "p-iced-americano", 1)], { clientTxId: "tx-off" });
    syncOrders(s, { orders: [{ transactionId: "tx-off", order, createdAt: t }] }, USER, NOW);
    expect(s.orders.at(-1)?.createdAt).toBe(t);
    expect(s.stockTx.at(-1)?.createdAt).toBe(NOW.toISOString());
  });

  it("reports failed items with a message and continues", () => {
    const s = createState("pos", NOW);
    s.ingredients.find((i) => i.id === "i-milk")!.currentStock = 0;
    const bad = req([line(s, "p-iced-spanish-latte", 1)], { clientTxId: "bad" });
    const good = req([line(s, "p-iced-americano", 1)], { clientTxId: "good" });
    const r = syncOrders(
      s,
      {
        orders: [
          { transactionId: "bad", order: bad, createdAt: "" },
          { transactionId: "good", order: good, createdAt: "" },
        ],
      },
      USER,
      NOW,
    );
    expect(r.processedCount).toBe(2);
    expect(r.results[0]).toMatchObject({ status: "failed" });
    expect(r.results[0]?.error).toMatch(/milk/i);
    expect(r.results[1]?.status).toBe("synced");
  });
});
