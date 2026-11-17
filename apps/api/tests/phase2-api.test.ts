import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Route-level tests with a fake Supabase client. Database rules (RLS, triggers, checkout atomicity)
// are tested against real PostgreSQL in supabase/tests/phase2_core.test.sql.

type Result = {
  data?: unknown;
  error?: { code?: string; message: string } | null;
  count?: number;
};
interface Call {
  table: string;
  op: "select" | "insert" | "update" | "upsert" | "delete";
  payload?: unknown;
  filters: [string, unknown[]][];
}

const profiles: Record<
  string,
  { user_id: number; role: string; status: string }
> = {
  "owner-token": { user_id: 1, role: "owner_admin", status: "active" },
  "barista-token": { user_id: 2, role: "barista", status: "active" },
  "inactive-token": { user_id: 3, role: "barista", status: "inactive" },
};

let onQuery: (c: Call) => Result = () => ({ data: [] });
let onRpc: (name: string, args: unknown) => Result = () => ({ data: null });
const calls: Call[] = [];
const rpcCalls: { name: string; args: unknown }[] = [];

function builder(table: string, token: string) {
  const call: Call = { table, op: "select", filters: [] };
  const answer = (): Result => {
    // requireUser's profile lookup
    if (
      table === "users" &&
      call.filters.some(([f, a]) => f === "eq" && a[0] === "auth_user_id")
    ) {
      return { data: profiles[token] ?? null, error: null };
    }
    calls.push(call);
    return { error: null, ...onQuery(call) };
  };
  const proxy: unknown = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === "then") {
          return (res: (v: Result) => unknown, rej: (e: unknown) => unknown) =>
            Promise.resolve().then(answer).then(res, rej);
        }
        if (prop === "single" || prop === "maybeSingle")
          return async () => answer();
        return (...args: unknown[]) => {
          if (["insert", "update", "upsert", "delete"].includes(prop)) {
            call.op = prop as Call["op"];
            call.payload = args[0];
          } else if (prop !== "select") {
            call.filters.push([prop, args]);
          }
          return proxy;
        };
      },
    },
  );
  return proxy;
}

vi.mock("../src/lib/supabase-user", () => ({
  createScopedUserClient: (token: string) => ({
    auth: {
      getUser: async () =>
        profiles[token]
          ? {
              data: { user: { id: `auth-${token}`, email: "x@example.com" } },
              error: null,
            }
          : { data: { user: null }, error: { message: "invalid JWT" } },
    },
    from: (table: string) => builder(table, token),
    rpc: async (name: string, args: unknown) => {
      rpcCalls.push({ name, args });
      return { error: null, ...onRpc(name, args) };
    },
  }),
}));
const audits: unknown[] = [];
vi.mock("../src/lib/audit", () => ({
  logAuditEvent: async (e: unknown) => void audits.push(e),
  auditAction: async (...a: unknown[]) => void audits.push(a),
}));

const products = await import("../src/app/api/products/route");
const productById = await import("../src/app/api/products/[id]/route");
const stock = await import("../src/app/api/stock-transactions/route");
const orders = await import("../src/app/api/orders/route");
const orderById = await import("../src/app/api/orders/[id]/route");
const sync = await import("../src/app/api/sync/route");
const reports = await import("../src/app/api/reports/[type]/route");
const dashboard = await import("../src/app/api/dashboard/route");
const users = await import("../src/app/api/users/[id]/route");
const { computeCosting } = await import("../src/modules/products/service");
const { dbError } = await import("../src/lib/errors");
const { errorResponse } = await import("../src/lib/response");

function req(method: string, path: string, token?: string, body?: unknown) {
  return new NextRequest(`http://localhost:3002${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      "content-type": "application/json",
    },
    body:
      body === undefined
        ? undefined
        : typeof body === "string"
          ? body
          : JSON.stringify(body),
  });
}
const params = <T>(p: T) => ({ params: Promise.resolve(p) });
async function call(res: Promise<Response>) {
  const r = await res;
  return {
    status: r.status,
    body: (await r.json()) as { success: boolean; data?: any; error?: any },
  };
}

const uuid = (n: number) =>
  `${n}${n}${n}${n}${n}${n}${n}${n}-1111-4111-8111-111111111111`;
const sale = (n: number, extra: Record<string, unknown> = {}) => ({
  clientTxId: uuid(n),
  type: "dine-in",
  items: [
    {
      productId: "1",
      productName: "Latte",
      quantity: 2,
      unitPrice: 120,
      subtotal: 240,
    },
  ],
  totalAmount: 240,
  paidAmount: 300,
  paymentMethod: "cash",
  ...extra,
});

// Rows the fake database returns for order 7: 2 lattes + 1 add-on, paid 300.
const order7: Result = {
  data: [
    {
      order_line_id: 1,
      order_id: 7,
      client_tx_id: uuid(1),
      user_id: 2,
      product_id: 1,
      ingredient_id: null,
      is_addon: false,
      quantity: 2,
      unit_price: 120,
      subtotal: 240,
      order_type: "dine-in",
      order_date: "2026-11-17T01:00:00Z",
      status: "pending",
      customization: "less ice",
      special_instructions: null,
      products: { product_name: "Latte" },
      ingredients: null,
      users: { full_name: "Bea" },
    },
    {
      order_line_id: 2,
      order_id: 7,
      client_tx_id: uuid(1),
      user_id: 2,
      product_id: null,
      ingredient_id: 3,
      is_addon: true,
      quantity: 1,
      unit_price: 15,
      subtotal: 15,
      order_type: "dine-in",
      order_date: "2026-11-17T01:00:00Z",
      status: "pending",
      customization: null,
      special_instructions: null,
      products: null,
      ingredients: { ingredient_name: "Vanilla syrup" },
      users: { full_name: "Bea" },
    },
  ],
};
const payment7: Result = {
  data: [
    {
      order_id: 7,
      amount_paid: 300,
      change_amount: 45,
      payment_method: "cash",
      received_by: 2,
      date_time: "2026-11-17T01:00:00Z",
    },
  ],
};

beforeEach(() => {
  calls.length = 0;
  rpcCalls.length = 0;
  audits.length = 0;
  onQuery = () => ({ data: [] });
  onRpc = () => ({ data: null });
});

describe("authentication and authorization", () => {
  it("rejects a request without a token (401)", async () => {
    const r = await call(products.GET(req("GET", "/api/products"), undefined));
    expect(r.status).toBe(401);
  });

  it("rejects an inactive account (403)", async () => {
    const r = await call(
      products.GET(req("GET", "/api/products", "inactive-token"), undefined),
    );
    expect(r.status).toBe(403);
  });

  it("lets a barista read the catalog but not change it", async () => {
    expect(
      (
        await call(
          products.GET(req("GET", "/api/products", "barista-token"), undefined),
        )
      ).status,
    ).toBe(200);
    const r = await call(
      products.POST(
        req("POST", "/api/products", "barista-token", { name: "X", price: 1 }),
        undefined,
      ),
    );
    expect(r.status).toBe(403);
    expect(calls.filter((c) => c.op === "insert")).toHaveLength(0);
  });

  it.each([
    [
      "reports",
      () =>
        reports.GET(
          req("GET", "/api/reports/daily", "barista-token"),
          params({ type: "daily" }),
        ),
    ],
    [
      "dashboard",
      () =>
        dashboard.GET(req("GET", "/api/dashboard", "barista-token"), undefined),
    ],
    [
      "staff",
      () =>
        users.PATCH(
          req("PATCH", "/api/users/2", "barista-token", { status: "inactive" }),
          params({ id: "2" }),
        ),
    ],
  ])("keeps %s Owner-only", async (_name, run) => {
    expect((await call(run())).status).toBe(403);
  });

  it("keeps sync and checkout Barista-only (FR-54)", async () => {
    expect(
      (
        await call(
          sync.POST(
            req("POST", "/api/sync", "owner-token", { orders: [] }),
            undefined,
          ),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await call(
          orders.POST(
            req("POST", "/api/orders", "owner-token", sale(1)),
            undefined,
          ),
        )
      ).status,
    ).toBe(403);
  });
});

describe("products", () => {
  it.each<[Record<string, unknown>, string]>([
    [{ price: 100 }, "missing name"],
    [{ name: "Latte", price: -1 }, "negative price"],
    [{ name: "Latte", price: 1.234 }, "three decimals"],
  ])("rejects %j (%s)", async (body) => {
    const r = await call(
      products.POST(
        req("POST", "/api/products", "owner-token", body),
        undefined,
      ),
    );
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects malformed JSON and non-numeric ids with 400", async () => {
    const bad = await call(
      products.POST(
        req("POST", "/api/products", "owner-token", "{nope"),
        undefined,
      ),
    );
    expect(bad.body.error.code).toBe("INVALID_JSON");
    const id = await call(
      productById.GET(
        req("GET", "/api/products/abc", "owner-token"),
        params({ id: "abc" }),
      ),
    );
    expect(id.status).toBe(400);
  });

  it("saves the creator from the session and updates availability alone", async () => {
    const row = {
      product_id: 5,
      product_name: "Latte",
      description: null,
      category: "Coffee",
      price: 120,
      is_available: false,
      image: null,
      created_by: 1,
      date_created: "2026-11-17",
    };
    onQuery = () => ({ data: row });
    const created = await call(
      products.POST(
        req("POST", "/api/products", "owner-token", {
          name: "Latte",
          price: 120,
          createdBy: 99,
        }),
        undefined,
      ),
    );
    expect(created.status).toBe(201);
    expect(calls[0]!.payload).toMatchObject({
      created_by: 1,
      product_name: "Latte",
    });

    const updated = await call(
      productById.PATCH(
        req("PATCH", "/api/products/5", "owner-token", { isAvailable: false }),
        params({ id: "5" }),
      ),
    );
    expect(updated.status).toBe(200);
    expect(JSON.parse(JSON.stringify(calls[1]!.payload))).toEqual({
      is_available: false,
    });
    expect(updated.body.data.isAvailable).toBe(false);
  });
});

describe("inventory", () => {
  it("allows stock-in only for the Owner and stock-out only for the Barista", async () => {
    const tx = (type: string) => ({ ingredientId: 1, type, quantity: 5 });
    expect(
      (
        await call(
          stock.POST(
            req("POST", "/api/stock-transactions", "barista-token", tx("in")),
            undefined,
          ),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await call(
          stock.POST(
            req("POST", "/api/stock-transactions", "owner-token", tx("out")),
            undefined,
          ),
        )
      ).status,
    ).toBe(403);
  });

  it.each([0, -3])("rejects quantity %d", async (quantity) => {
    const r = await call(
      stock.POST(
        req("POST", "/api/stock-transactions", "barista-token", {
          ingredientId: 1,
          type: "out",
          quantity,
        }),
        undefined,
      ),
    );
    expect(r.status).toBe(400);
  });

  it("returns the database's stock conflict as 409 and records the caller", async () => {
    onQuery = (c) =>
      c.table === "v_inventory_status"
        ? {
            data: {
              ingredient_id: 1,
              ingredient_name: "Milk",
              unit: "ml",
              current_stock: 2,
              reorder_level: 5,
              stock_status: "low-stock",
              supplier_id: null,
              supplier_name: null,
              unit_cost: 0.1,
              date_updated: "x",
            },
          }
        : {
            data: null,
            error: {
              code: "P0001",
              message: "STOCK_CONFLICT: not enough stock for ingredient 1",
            },
          };
    const r = await call(
      stock.POST(
        req("POST", "/api/stock-transactions", "barista-token", {
          ingredientId: 1,
          type: "out",
          quantity: 5,
        }),
        undefined,
      ),
    );
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe("STOCK_CONFLICT");
    expect(calls.find((c) => c.op === "insert")!.payload).toMatchObject({
      user_id: 2,
      type: "out",
      quantity: 5,
    });
  });
});

describe("orders and checkout", () => {
  const ordersDb = (c: Call): Result =>
    c.table === "payments" ? payment7 : order7;

  it("rejects non-cash payment before touching the database", async () => {
    const r = await call(
      orders.POST(
        req(
          "POST",
          "/api/orders",
          "barista-token",
          sale(1, { paymentMethod: "card" }),
        ),
        undefined,
      ),
    );
    expect(r.status).toBe(400);
    expect(r.body.error.message).toBe("Payment is cash only");
    expect(rpcCalls).toHaveLength(0);
  });

  it("checks out through the atomic function and returns receipt data", async () => {
    onRpc = () => ({ data: { order_id: 7, duplicate: false } });
    onQuery = ordersDb;
    const r = await call(
      orders.POST(
        req("POST", "/api/orders", "barista-token", sale(1)),
        undefined,
      ),
    );
    expect(r.status).toBe(201);
    expect(rpcCalls[0]!.name).toBe("process_checkout_transaction");
    expect(rpcCalls[0]!.args).toMatchObject({
      p_order: {
        client_tx_id: uuid(1),
        amount_paid: 300,
        items: [{ product_id: 1, unit_price: 120 }],
      },
    });
    const order = r.body.data.order;
    expect(order.orderId).toBe(7);
    expect(order.items).toHaveLength(2);
    expect(order.items[1]).toMatchObject({
      isAddon: true,
      name: "Vanilla syrup",
      ingredientId: 3,
    });
    expect(order.total).toBe(255);
    expect(order.payment).toMatchObject({ amountPaid: 300, changeAmount: 45 });
  });

  it("answers a repeated clientTxId with the first order and 200", async () => {
    onRpc = () => ({ data: { order_id: 7, duplicate: true } });
    onQuery = ordersDb;
    const r = await call(
      orders.POST(
        req("POST", "/api/orders", "barista-token", sale(1)),
        undefined,
      ),
    );
    expect(r.status).toBe(200);
    expect(r.body.data.duplicate).toBe(true);
  });

  it("maps a stale price to 409 PRICE_CONFLICT", async () => {
    onRpc = () => ({
      error: {
        code: "P0001",
        message: "PRICE_CONFLICT: price changed to 130 for item",
      },
    });
    const r = await call(
      orders.POST(
        req("POST", "/api/orders", "barista-token", sale(1)),
        undefined,
      ),
    );
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe("PRICE_CONFLICT");
  });

  it("rejects an invalid status transition with 409 and audits a valid one", async () => {
    onQuery = () => ({
      data: null,
      error: {
        code: "P0001",
        message:
          "INVALID_TRANSITION: an order cannot move from pending to completed",
      },
    });
    const bad = await call(
      orderById.PATCH(
        req("PATCH", "/api/orders/7", "barista-token", { status: "completed" }),
        params({ id: "7" }),
      ),
    );
    expect(bad.status).toBe(409);
    expect(bad.body.error.code).toBe("INVALID_TRANSITION");

    onQuery = (c) =>
      c.op === "update" ? { data: [{ order_line_id: 1 }] } : ordersDb(c);
    const ok = await call(
      orderById.PATCH(
        req("PATCH", "/api/orders/7", "barista-token", { status: "preparing" }),
        params({ id: "7" }),
      ),
    );
    expect(ok.status).toBe(200);
    expect(audits).toHaveLength(1);
    const bogus = await call(
      orderById.PATCH(
        req("PATCH", "/api/orders/7", "barista-token", { status: "delivered" }),
        params({ id: "7" }),
      ),
    );
    expect(bogus.status).toBe(400);
  });
});

describe("offline sync", () => {
  const item = (n: number, extra: Record<string, unknown> = {}) => ({
    transactionId: uuid(n),
    order: sale(n, extra),
    createdAt: "2026-11-17T00:00:00Z",
  });

  it("reports each order on its own and never leaks database internals", async () => {
    onRpc = (_n, args) => {
      const tx = (args as { p_order: { client_tx_id: string } }).p_order
        .client_tx_id;
      if (tx === uuid(1)) return { data: { order_id: 10, duplicate: false } };
      if (tx === uuid(2)) return { data: { order_id: 8, duplicate: true } };
      if (tx === uuid(3))
        return {
          error: {
            code: "P0001",
            message: "STOCK_CONFLICT: not enough stock for ingredient 4",
          },
        };
      return {
        error: {
          code: "XX000",
          message: "relation secret_internal does not exist",
        },
      };
    };
    const r = await call(
      sync.POST(
        req("POST", "/api/sync", "barista-token", {
          orders: [
            item(1),
            item(2),
            item(3),
            item(4),
            item(5, { paymentMethod: "card" }),
          ],
        }),
        undefined,
      ),
    );
    expect(r.status).toBe(200);
    const results = r.body.data.results;
    expect(results.map((x: { status: string }) => x.status)).toEqual([
      "synced",
      "duplicate",
      "conflict",
      "failed",
      "failed",
    ]);
    expect(results[0].orderId).toBe("10");
    expect(results[1].orderId).toBe("8");
    expect(results[2]).toMatchObject({ code: "STOCK_CONFLICT" });
    expect(results[2].orderId).toBeUndefined();
    expect(results[3].error).toBe("Checkout could not be saved");
    expect(JSON.stringify(r.body)).not.toContain("secret_internal");
    expect(results[4]).toMatchObject({
      code: "VALIDATION",
      error: "Payment is cash only",
    });
  });

  it("rejects a transactionId that differs from clientTxId", async () => {
    const r = await call(
      sync.POST(
        req("POST", "/api/sync", "barista-token", {
          orders: [{ ...item(1), transactionId: uuid(2) }],
        }),
        undefined,
      ),
    );
    expect(r.status).toBe(400);
    expect(rpcCalls).toHaveLength(0);
  });
});

describe("reports", () => {
  it("returns the view rows with totals that add up", async () => {
    onQuery = () => ({
      data: [
        {
          sale_date: "2026-11-17",
          order_count: 3,
          items_sold: 5,
          total_sales: 410.5,
        },
        {
          sale_date: "2026-11-16",
          order_count: 2,
          items_sold: 2,
          total_sales: 240.25,
        },
      ],
    });
    const r = await call(
      reports.GET(
        req("GET", "/api/reports/daily?from=2026-11-01", "owner-token"),
        params({ type: "daily" }),
      ),
    );
    expect(r.status).toBe(200);
    expect(r.body.data.totals).toEqual({ orderCount: 5, totalSales: 650.75 });
    expect(calls[0]!.table).toBe("v_daily_sales");
    expect(calls[0]!.filters).toContainEqual([
      "gte",
      ["sale_date", "2026-11-01"],
    ]);
  });

  it("rejects an unknown report type", async () => {
    const r = await call(
      reports.GET(
        req("GET", "/api/reports/profit", "owner-token"),
        params({ type: "profit" }),
      ),
    );
    expect(r.status).toBe(400);
  });
});

describe("costing and error mapping", () => {
  it("adds packaging to the stored ingredient cost and flags missing unit costs", () => {
    const c = computeCosting(
      { id: 1, name: "Latte", price: 120 },
      [
        {
          ingredientId: 1,
          ingredientName: "Beans",
          unit: "g",
          quantityNeeded: 18,
          unitCost: 0.5,
        },
        {
          ingredientId: 2,
          ingredientName: "Milk",
          unit: "ml",
          quantityNeeded: 200,
          unitCost: 0.1,
        },
        {
          ingredientId: 3,
          ingredientName: "Cup",
          unit: "pcs",
          quantityNeeded: 1,
          unitCost: null,
        },
      ],
      { ingredientCost: 29, packagingCost: 6.5 },
    );
    expect(c.lines.map((l) => l.cost)).toEqual([9, 20, 0]);
    expect(c.totalCost).toBe(35.5);
    expect(c.margin).toBe(84.5);
    expect(c.marginPercent).toBe(70.42);
    expect(c.missingUnitCost).toEqual([3]);
  });

  it("maps database errors to safe responses", async () => {
    expect(
      dbError({ code: "23505", message: "duplicate key users_username_key" })
        .statusCode,
    ).toBe(409);
    expect(
      dbError({ code: "42501", message: "new row violates row-level security" })
        .statusCode,
    ).toBe(403);
    expect(
      dbError({ code: "23514", message: "check constraint" }).statusCode,
    ).toBe(400);
    const masked = await errorResponse(
      dbError({ code: "XX000", message: "relation secret_internal" }),
    ).json();
    expect(masked.error.message).toBe("An unexpected error occurred");
  });
});
