import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST, OPTIONS } from "@/server/routes/mock/rpc/route";

const actor = { id: "u-juan", fullName: "Juan Dela Cruz" };
let dir: string;

function call(app: string, op: string, args: unknown[] = []) {
  return POST(
    new NextRequest("http://localhost:3002/api/mock/rpc", {
      method: "POST",
      body: JSON.stringify({ app, op, args }),
      headers: { origin: "http://localhost:3000", "content-type": "application/json" },
    }),
  );
}

async function orderReq() {
  const res = await call("pos", "listCatalog");
  const { data } = await res.json();
  const p = data.products.find((x: { isActive: boolean }) => x.isActive);
  return {
    clientTxId: "tx-" + Math.random(),
    type: "dine-in",
    items: [
      { productId: p.id, productName: p.name, quantity: 1, unitPrice: p.sellingPrice, subtotal: p.sellingPrice, addons: [] },
    ],
    totalAmount: p.sellingPrice,
    taxAmount: 0,
    discountAmount: 0,
    paidAmount: p.sellingPrice + 10,
    paymentMethod: "cash",
  };
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "gk-mock-"));
  process.env.MOCK_DATA_DIR = dir;
  process.env.MOCK_MODE = "true";
  globalThis.__gkMockDb = undefined;
});
afterEach(() => {
  delete process.env.MOCK_MODE;
  delete process.env.MOCK_DATA_DIR;
  globalThis.__gkMockDb = undefined;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("mock rpc", () => {
  it("returns 404 when MOCK_MODE is off", async () => {
    process.env.MOCK_MODE = "false";
    const res = await call("owner", "listProducts");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: { code: "NOT_FOUND", message: "Mock mode is off" } });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3000");
  });

  it("answers preflight with CORS headers", () => {
    const res = OPTIONS(new NextRequest("http://localhost:3002/api/mock/rpc", { method: "OPTIONS", headers: { origin: "http://localhost:3000" } }));
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3000");
  });

  it("pos cannot call owner ops", async () => {
    const res = await call("pos", "listSuppliers");
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("UNKNOWN_OP");
  });

  it("order placed by pos is visible to owner", async () => {
    const placed = await (await call("pos", "placeOrder", [await orderReq(), actor])).json();
    expect(placed.ok).toBe(true);
    const list = await (await call("owner", "listOrders", [{}])).json();
    expect(list.data.map((o: { orderNumber: string }) => o.orderNumber)).toContain(placed.data.orderNumber);
  });

  it("pos catalog has no cost fields", async () => {
    const text = await (await call("pos", "listCatalog")).text();
    expect(text).not.toContain("unitCost");
    expect(text).not.toContain("costPrice");
  });

  it("file store survives restart", async () => {
    const placed = await (await call("pos", "placeOrder", [await orderReq(), actor])).json();
    globalThis.__gkMockDb = undefined;
    const list = await (await call("owner", "listOrders", [{}])).json();
    expect(list.data.map((o: { orderNumber: string }) => o.orderNumber)).toContain(placed.data.orderNumber);
  });

  it("mock errors map to 400", async () => {
    const req = { ...(await orderReq()), paidAmount: 0 };
    const res = await call("pos", "placeOrder", [req, actor]);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION");
  });
});
