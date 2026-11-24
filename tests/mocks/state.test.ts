import { describe, expect, it } from "vitest";
import { PRODUCT_CATEGORIES } from "@/contracts/ui";
import { createState, loadState, saveState, MockError, type StateStorage } from "@/mocks/store/state";

const NOW = new Date(2026, 10, 3, 15, 0, 0);
const KEY = "test-key";

function memStorage(initial: Record<string, string> = {}): StateStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? (data[k] as string) : null),
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

const dayOf = (iso: string) => new Date(iso).toDateString();

describe("createState", () => {
  it("owner state has suppliers, users, products across all categories and an order today", () => {
    const s = createState("owner", NOW);
    expect(s.suppliers).toHaveLength(6);
    expect(s.users).toHaveLength(3);
    expect(s.products.length).toBeGreaterThanOrEqual(15);
    expect(new Set(s.products.map((p) => p.category))).toEqual(new Set(PRODUCT_CATEGORIES));
    expect(s.orders.some((o) => dayOf(o.createdAt) === NOW.toDateString())).toBe(true);
    expect(s.unitCosts?.["i-beans"]).toBe(0.9);
    expect(s.users?.find((u) => u.username === "owner")?.password).toBe("owner123");
    expect(s.settings).toEqual({
      shopName: "Gunita Kopi",
      receiptFooter: "Salamat po! Come again.",
      queuePrefix: "A",
      autoLogoutMin: 480,
    });
  });

  it("pos state carries no owner-only data", () => {
    const s = createState("pos", NOW);
    expect(s.suppliers).toBeUndefined();
    expect(s.users).toBeUndefined();
    expect(s.unitCosts).toBeUndefined();
    const json = JSON.stringify(s);
    for (const bad of ["unitCost", "costPrice", "supplier", "password"]) {
      expect(json).not.toContain(bad);
    }
  });

  it("is deterministic for the same now", () => {
    expect(createState("owner", NOW)).toEqual(createState("owner", NOW));
  });

  it("numbers orders YYYYMMDD-A-### and leaves the queue at today's last seq", () => {
    const s = createState("owner", NOW);
    const today = s.orders.filter((o) => o.orderNumber?.startsWith("20261103-A-"));
    expect(today).toHaveLength(12);
    expect(s.queue).toEqual({ day: "20261103", seq: 12 });
    const o12 = s.orders.find((o) => o.orderNumber === "20261103-A-012");
    expect(o12?.status).toBe("preparing");
    expect(o12?.totalAmount).toBe(160);
    expect(o12?.items[0]?.addons?.[0]?.ingredientId).toBe("i-hazelnut");
  });

  it("has orders on prior days", () => {
    const s = createState("owner", NOW);
    expect(s.orders.some((o) => dayOf(o.createdAt) !== NOW.toDateString())).toBe(true);
  });
});

describe("persistence", () => {
  it("reseeds on corrupt JSON", () => {
    const st = memStorage({ [KEY]: "{not json" });
    const s = loadState(st, KEY, "owner", NOW);
    expect(s.products.length).toBeGreaterThan(0);
    expect(s.suppliers).toHaveLength(6);
  });

  it("reseeds on missing key and null storage", () => {
    expect(loadState(memStorage(), KEY, "pos", NOW).orders.length).toBeGreaterThan(0);
    expect(loadState(null, KEY, "pos", NOW).orders.length).toBeGreaterThan(0);
  });

  it("save then load returns equal state", () => {
    const st = memStorage();
    const s = createState("owner", NOW);
    s.settings.shopName = "Changed";
    saveState(st, KEY, s);
    expect(loadState(st, KEY, "owner", new Date(2030, 0, 1))).toEqual(s);
  });
});

describe("MockError", () => {
  it("carries a code", () => {
    const e = new MockError("NOT_FOUND", "nope");
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe("NOT_FOUND");
    expect(e.message).toBe("nope");
  });
});
