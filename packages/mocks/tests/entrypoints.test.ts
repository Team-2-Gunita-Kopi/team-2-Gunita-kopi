import { describe, expect, it } from "vitest";
import { createOwnerMockDb, createPosView, OWNER_OPS, POS_OPS, type StateStorage } from "../src/owner";
import { NOW, USER } from "./helpers";

const memory = (): StateStorage & { writes: number } => {
  const m = new Map<string, string>();
  return {
    writes: 0,
    getItem: (k) => m.get(k) ?? null,
    setItem(k, v) {
      this.writes++;
      m.set(k, v);
    },
  };
};
const mk = (storage: StateStorage | null = memory()) => createOwnerMockDb({ storage, now: () => NOW });
const OWNER_ONLY = ["unitCost", "costPrice", "profitMarginPercent", "supplierId", "supplierName", "password"];

describe("entry points", () => {
  it("POS results never contain owner-only fields", () => {
    const pos = createPosView(mk());
    const json = JSON.stringify([pos.listCatalog(), pos.listIngredients()]);
    for (const f of OWNER_ONLY) expect(json).not.toContain(`"${f}"`);
    expect(pos.listCatalog().products.length).toBeGreaterThan(0);
    expect(pos.authenticate("nobody", "x")).toBeNull();
  });

  it("orders placed through POS are visible to the owner db", () => {
    const db = mk();
    const pos = createPosView(db);
    const p = pos.listCatalog().products.find((x) => x.isActive)!;
    const before = db.listOrders({}).length;
    const subtotal = p.sellingPrice;
    const order = pos.placeOrder(
      {
        clientTxId: "tx-pos-1",
        type: "dine-in",
        items: [
          { productId: p.id, productName: p.name, quantity: 1, unitPrice: p.sellingPrice, subtotal, addons: [] },
        ],
        totalAmount: subtotal,
        taxAmount: 0,
        discountAmount: 0,
        paidAmount: subtotal + 10,
        paymentMethod: "cash",
      },
      USER,
    );
    expect(db.listOrders({})).toHaveLength(before + 1);
    expect(db.getOrder(order.id).id).toBe(order.id);
  });

  it("persists across instances and only writes on mutation", () => {
    const storage = memory();
    const a = mk(storage);
    const before = storage.writes;
    a.listProducts();
    expect(storage.writes).toBe(before);
    const p = a.listProducts()[0]!;
    a.setProductAvailability(p.id, !p.isActive);
    expect(storage.writes).toBe(before + 1);
    expect(mk(storage).getProduct(p.id).isActive).toBe(!p.isActive);
    a.reset();
    expect(mk(storage).getProduct(p.id).isActive).toBe(p.isActive);
  });

  it("allow-lists match bound methods exactly", () => {
    const db = mk();
    const pos = createPosView(db);
    expect([...OWNER_OPS].sort()).toEqual(Object.keys(db).sort());
    expect([...POS_OPS].sort()).toEqual(Object.keys(pos).sort());
    for (const k of OWNER_OPS) expect(typeof db[k]).toBe("function");
    for (const k of POS_OPS) expect(typeof pos[k]).toBe("function");
  });
});
