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

// Owner sessions are verified tokens after MFA (aal2); apps/api reads the aal claim.
const OWNER = `e30.${Buffer.from(JSON.stringify({ aal: "aal2" })).toString("base64url")}.sig`;

const profiles: Record<
  string,
  { user_id: number; role: string; status: string }
> = {
  [OWNER]: { user_id: 1, role: "owner_admin", status: "active" },
  "barista-token": { user_id: 2, role: "barista", status: "active" },
  "inactive-token": { user_id: 3, role: "barista", status: "inactive" },
};

let onQuery: (c: Call) => Result = () => ({ data: [] });
let onRpc: (name: string, args: unknown) => Result = () => ({ data: null });
const calls: Call[] = [];
const rpcCalls: { name: string; args: unknown }[] = [];
const storageCalls: Record<string, unknown>[] = [];
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
]);

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
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, body: Uint8Array, opts: unknown) => {
          storageCalls.push({
            op: "upload",
            bucket,
            path,
            opts,
            size: body.length,
          });
          return { data: { path }, error: null };
        },
        remove: async (paths: string[]) => {
          storageCalls.push({ op: "remove", bucket, path: paths[0] });
          return { data: [], error: null };
        },
        download: async (path: string) => {
          storageCalls.push({ op: "download", bucket, path });
          return { data: new Blob([PNG]), error: null };
        },
      }),
    },
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
const productImage = await import("../src/app/api/products/[id]/image/route");
const stock = await import("../src/app/api/stock-transactions/route");
const ingredientList = await import("../src/app/api/ingredients/route");
const ingredientById = await import("../src/app/api/ingredients/[id]/route");
const ingredientSuppliers = await import("../src/app/api/ingredients/suppliers/route");
const suppliers = await import("../src/app/api/suppliers/route");
const costingRoute = await import("../src/app/api/products/[id]/costing/route");
const recipeRoute = await import("../src/app/api/products/[id]/recipe/route");
const costingList = await import("../src/app/api/products/costing/route");
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
  storageCalls.length = 0;
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
          sync.POST(req("POST", "/api/sync", OWNER, { orders: [] }), undefined),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await call(
          orders.POST(req("POST", "/api/orders", OWNER, sale(1)), undefined),
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
      products.POST(req("POST", "/api/products", OWNER, body), undefined),
    );
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects malformed JSON and non-numeric ids with 400", async () => {
    const bad = await call(
      products.POST(req("POST", "/api/products", OWNER, "{nope"), undefined),
    );
    expect(bad.body.error.code).toBe("INVALID_JSON");
    const id = await call(
      productById.GET(
        req("GET", "/api/products/abc", OWNER),
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
        req("POST", "/api/products", OWNER, {
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
        req("PATCH", "/api/products/5", OWNER, { isAvailable: false }),
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

describe("product images (FR-50)", () => {
  const OLD = "5/11111111-2222-4333-8444-555555555555.jpg";
  const row = (image: string | null) => ({
    product_id: 5,
    product_name: "Latte",
    description: null,
    category: "Coffee",
    price: 120,
    is_available: true,
    image,
    created_by: 1,
    date_created: "2026-11-17",
  });
  const put = (token: string, body: Uint8Array) =>
    call(
      productImage.PUT(
        new NextRequest("http://localhost:3002/api/products/5/image", {
          method: "PUT",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "image/png",
          },
          body: new Blob([body as Uint8Array<ArrayBuffer>]),
        }),
        params({ id: "5" }),
      ),
    );

  it("Owner upload: server-generated path, product points at it, old stored file removed", async () => {
    let image: string | null = OLD;
    onQuery = (c) => {
      if (c.op === "update") image = (c.payload as { image: string }).image;
      return { data: row(image) };
    };
    const r = await put(OWNER, PNG);
    expect(r.status).toBe(200);
    const upload = storageCalls.find((c) => c.op === "upload")!;
    expect(upload.bucket).toBe("product-images");
    expect(upload.path).toMatch(/^5\/[0-9a-f-]{36}\.png$/);
    expect(upload.opts).toMatchObject({
      contentType: "image/png",
      upsert: false,
    });
    expect(r.body.data.image).toBe(upload.path);
    expect(storageCalls).toContainEqual({
      op: "remove",
      bucket: "product-images",
      path: OLD,
    });
  });

  it("rejects a barista, a non-image and an oversized file", async () => {
    onQuery = () => ({ data: row(null) });
    expect((await put("barista-token", PNG)).status).toBe(403);
    const html = await put(
      OWNER,
      new TextEncoder().encode("<script>alert(1)</script>"),
    );
    expect(html.status).toBe(415);
    expect(html.body.error.code).toBe("UNSUPPORTED_IMAGE");
    const big = new Uint8Array(2 * 1024 * 1024 + 1);
    big.set(PNG);
    expect((await put(OWNER, big)).body.error.code).toBe("IMAGE_TOO_LARGE");
    expect(storageCalls.some((c) => c.op === "upload")).toBe(false);
  });

  it("serves a stored image to both roles; no stored image or a foreign path is a 404", async () => {
    onQuery = () => ({ data: row(OLD) });
    const res = await productImage.GET(
      req("GET", "/api/products/5/image", "barista-token"),
      params({ id: "5" }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");

    for (const image of [
      null,
      "https://example.com/a.png",
      "6/11111111-2222-4333-8444-555555555555.png",
      "5/../x.png",
    ]) {
      onQuery = () => ({ data: row(image) });
      const r = await productImage.GET(
        req("GET", "/api/products/5/image", OWNER),
        params({ id: "5" }),
      );
      expect(r.status).toBe(404);
    }
    expect(
      (
        await productImage.GET(
          req("GET", "/api/products/5/image"),
          params({ id: "5" }),
        )
      ).status,
    ).toBe(401);
  });

  it("Owner removes the image: column cleared and stored file deleted", async () => {
    onQuery = (c) => ({ data: row(c.op === "update" ? null : OLD) });
    const r = await call(
      productImage.DELETE(
        req("DELETE", "/api/products/5/image", OWNER),
        params({ id: "5" }),
      ),
    );
    expect(r.status).toBe(200);
    expect(r.body.data.image).toBeNull();
    expect(storageCalls).toContainEqual({
      op: "remove",
      bucket: "product-images",
      path: OLD,
    });
  });
});

describe("inventory", () => {
  it("allows Owner and Barista stock-in/out", async () => {
    const tx = (type: string) => ({ ingredientId: 1, type, quantity: 5 });
    onRpc = () => ({ data: [] });
    onQuery = (c) => {
      if (c.table === "v_inventory_status") {
        return {
          data: {
            ingredient_id: 1,
            ingredient_name: "Milk",
            unit: "ml",
            current_stock: 200,
            reorder_level: 20,
            stock_status: "available",
            supplier_id: null,
            supplier_name: null,
            date_updated: "2026-11-19T00:00:00Z",
            is_addon: false,
            addon_selling_price: null,
            addon_quantity: null,
          },
        };
      }
      if (c.table === "stock_transactions" && c.op === "insert") {
        const movement = c.payload as {
          type: "in" | "out";
          quantity: number;
          user_id: number;
        };
        return {
          data: {
            stock_trans_id: 10,
            ingredient_id: 1,
            user_id: movement.user_id,
            type: movement.type,
            quantity: movement.quantity,
            remaining_stock: movement.type === "in" ? 205 : 195,
            date_time: "2026-11-19T00:00:00Z",
            remarks: null,
            ingredients: { ingredient_name: "Milk" },
            users: { full_name: movement.user_id === 1 ? "Owner" : "Barista" },
          },
        };
      }
      return { data: [] };
    };
    const ownerIn = await call(
      stock.POST(
        req("POST", "/api/stock-transactions", OWNER, tx("in")),
        undefined,
      ),
    );
    expect(ownerIn.status).toBe(201);
    expect(ownerIn.body.data).toMatchObject({
      type: "in",
      quantity: 5,
      userId: 1,
    });

    const ownerOut = await call(
      stock.POST(
        req("POST", "/api/stock-transactions", OWNER, tx("out")),
        undefined,
      ),
    );
    expect(ownerOut.status).toBe(201);
    expect(ownerOut.body.data).toMatchObject({
      type: "out",
      quantity: 5,
      userId: 1,
    });

    const baristaIn = await call(
      stock.POST(
        req("POST", "/api/stock-transactions", "barista-token", tx("in")),
        undefined,
      ),
    );
    expect(baristaIn.status).toBe(201);
    expect(baristaIn.body.data).toMatchObject({
      type: "in",
      quantity: 5,
      userId: 2,
      userName: "Barista",
    });

    const baristaOut = await call(
      stock.POST(
        req("POST", "/api/stock-transactions", "barista-token", tx("out")),
        undefined,
      ),
    );
    expect(baristaOut.status).toBe(201);
    expect(baristaOut.body.data).toMatchObject({
      type: "out",
      quantity: 5,
      userId: 2,
      userName: "Barista",
    });
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
              date_updated: "x",
              is_addon: false,
              addon_selling_price: null,
              addon_quantity: null,
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

describe("ingredient costs and add-on configuration", () => {
  const beans = {
    ingredient_id: 21,
    ingredient_name: "Espresso Beans",
    unit: "g",
    current_stock: 200,
    reorder_level: 20,
    stock_status: "available",
    supplier_id: 1,
    supplier_name: null,
    date_updated: "2026-11-19T00:00:00Z",
    is_addon: true,
    addon_selling_price: 25,
    addon_quantity: 18,
  };
  const inventory = (c: Call): Result =>
    c.op === "select"
      ? { data: [beans], count: 1 }
      : { data: { ingredient_id: 21 } };
  const single = (c: Call): Result =>
    c.op === "select" ? { data: beans } : { data: { ingredient_id: 21 } };
  // Owner reads go through ingredient_unit_costs(); an empty list unless a test sets costs.
  beforeEach(() => {
    onRpc = () => ({ data: [] });
  });

  it("never sends ingredient costs to a barista", async () => {
    onQuery = inventory;
    const list = await call(
      ingredientList.GET(
        req("GET", "/api/ingredients", "barista-token"),
        undefined,
      ),
    );
    expect(list.status).toBe(200);
    expect(list.body.data.items[0]).not.toHaveProperty("unitCost");
    expect(list.body.data.items[0]).toMatchObject({
      supplierId: null,
      supplierName: null,
    });
    expect(list.body.data.items[0]).toMatchObject({
      isAddon: true,
      addonSellingPrice: 25,
      addonQuantity: 18,
    });
    onQuery = single;
    const one = await call(
      ingredientById.GET(
        req("GET", "/api/ingredients/21", "barista-token"),
        params({ id: "21" }),
      ),
    );
    expect(one.body.data).not.toHaveProperty("unitCost");
    expect(rpcCalls.map((r) => r.name)).not.toContain("ingredient_unit_costs");
    expect(JSON.stringify([list.body, one.body])).not.toMatch(/cost/i);
  });

  it("gives the Owner unit costs from ingredient_unit_costs()", async () => {
    onQuery = inventory;
    onRpc = (name) =>
      name === "ingredient_unit_costs"
        ? { data: [{ ingredient_id: 21, unit_cost: 1.25 }] }
        : { data: null };
    const r = await call(
      ingredientList.GET(req("GET", "/api/ingredients", OWNER), undefined),
    );
    expect(r.body.data.items[0].unitCost).toBe(1.25);
    // The view no longer has the column; nothing selects it directly.
    expect(JSON.stringify(calls)).not.toContain("unit_cost");
  });

  it.each([
    [
      "recipe",
      () =>
        recipeRoute.GET(
          req("GET", "/api/products/1/recipe", "barista-token"),
          params({ id: "1" }),
        ),
    ],
    [
      "costing",
      () =>
        costingRoute.GET(
          req("GET", "/api/products/1/costing", "barista-token"),
          params({ id: "1" }),
        ),
    ],
    [
      "reports",
      () =>
        reports.GET(
          req("GET", "/api/reports/best-sellers", "barista-token"),
          params({ type: "best-sellers" }),
        ),
    ],
    [
      "dashboard",
      () =>
        dashboard.GET(req("GET", "/api/dashboard", "barista-token"), undefined),
    ],
  ])("refuses %s to a barista (403)", async (_name, run) => {
    expect((await call(run())).status).toBe(403);
  });

  it("still computes Owner costing from unit costs", async () => {
    onQuery = (c) =>
      c.table === "products"
        ? {
            data: {
              product_id: 1,
              product_name: "Latte",
              description: null,
              category: "Iced Coffee",
              price: 120,
              is_available: true,
              image: null,
              created_by: 1,
              date_created: "x",
            },
          }
        : c.table === "product_ingredients"
          ? {
              data: [
                {
                  quantity_needed: 18,
                  ingredients: {
                    ingredient_id: 21,
                    ingredient_name: "Beans",
                    unit: "g",
                  },
                },
              ],
            }
          : {
              data: {
                ingredient_cost: 18,
                packaging_cost: 2,
                date_updated: "x",
              },
            };
    onRpc = () => ({ data: [{ ingredient_id: 21, unit_cost: 1 }] });
    const r = await call(
      costingRoute.GET(
        req("GET", "/api/products/1/costing", OWNER),
        params({ id: "1" }),
      ),
    );
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({
      totalCost: 20,
      margin: 100,
      missingUnitCost: [],
    });
    expect(r.body.data.lines[0]).toMatchObject({ unitCost: 1, cost: 18 });
  });

  it("lists every product's costing in one request, Owner only", async () => {
    onQuery = (c) =>
      c.table === "products"
        ? {
            data: [
              { product_id: 1, product_name: "Latte", price: 120 },
              { product_id: 2, product_name: "Silog", price: 80 },
            ],
          }
        : c.table === "product_ingredients"
          ? {
              data: [
                {
                  product_id: 1,
                  quantity_needed: 18,
                  ingredients: {
                    ingredient_id: 21,
                    ingredient_name: "Beans",
                    unit: "g",
                  },
                },
              ],
            }
          : {
              data: [
                {
                  product_id: 1,
                  ingredient_cost: 18,
                  packaging_cost: 2,
                  date_updated: "x",
                },
              ],
            };
    onRpc = () => ({ data: [{ ingredient_id: 21, unit_cost: 1 }] });
    rpcCalls.length = 0;
    const r = await call(
      costingList.GET(req("GET", "/api/products/costing", OWNER), undefined),
    );
    expect(r.status).toBe(200);
    expect(r.body.data).toHaveLength(2);
    expect(r.body.data[0]).toMatchObject({
      productId: 1,
      totalCost: 20,
      margin: 100,
    });
    expect(r.body.data[0].lines[0]).toMatchObject({ unitCost: 1, cost: 18 });
    // No recipe and no costing row: genuinely 0.
    expect(r.body.data[1]).toMatchObject({
      productId: 2,
      totalCost: 0,
      lines: [],
    });
    expect(
      rpcCalls.filter((c) => c.name === "ingredient_unit_costs"),
    ).toHaveLength(1);

    const barista = await call(
      costingList.GET(
        req("GET", "/api/products/costing", "barista-token"),
        undefined,
      ),
    );
    expect(barista.status).toBe(403);
    expect(barista.body.data).toBeUndefined();
  });

  it("fails the costing list instead of returning zero costs when a read fails", async () => {
    onQuery = (c) =>
      c.table === "product_costing"
        ? { error: { code: "XX000", message: "boom" } }
        : { data: [] };
    onRpc = () => ({ data: [] });
    const r = await call(
      costingList.GET(req("GET", "/api/products/costing", OWNER), undefined),
    );
    expect(r.status).toBe(500);
    expect(r.body.success).toBe(false);
  });

  it("saves an add-on with the fixed price, never a client price", async () => {
    onQuery = single;
    const r = await call(
      ingredientList.POST(
        req("POST", "/api/ingredients", OWNER, {
          name: "Espresso Beans",
          unit: "g",
          isAddon: true,
          addonQuantity: 18,
          addonSellingPrice: 30,
        }),
        undefined,
      ),
    );
    expect(r.status).toBe(201);
    expect(calls.find((c) => c.op === "insert")!.payload).toMatchObject({
      is_addon: true,
      addon_selling_price: 25,
      addon_quantity: 18,
    });
  });

  it("saves a regular ingredient as is_addon false with empty add-on fields", async () => {
    onQuery = single;
    await call(
      ingredientList.POST(
        req("POST", "/api/ingredients", OWNER, { name: "Rice" }),
        undefined,
      ),
    );
    expect(calls.find((c) => c.op === "insert")!.payload).toMatchObject({
      is_addon: false,
      addon_selling_price: null,
      addon_quantity: null,
    });
  });

  it("allows Baristas to create a basic ingredient and returns no Owner-only details", async () => {
    onRpc = (name) =>
      name === "create_barista_ingredient" ? { data: 21 } : { data: null };
    onQuery = single;
    const r = await call(
      ingredientList.POST(
        req("POST", "/api/ingredients", "barista-token", {
          name: "Sugar",
          unit: "g",
          supplierId: 6,
          reorderLevel: 25,
          openingStock: 500,
        }),
        undefined,
      ),
    );

    expect(r.status).toBe(201);
    expect(rpcCalls).toContainEqual({
      name: "create_barista_ingredient",
      args: {
        p_name: "Sugar",
        p_unit: "g",
        p_supplier_id: 6,
        p_reorder_level: 25,
        p_opening_stock: 500,
      },
    });
    expect(r.body.data).toMatchObject({
      id: 21,
      supplierId: null,
      supplierName: null,
    });
    expect(r.body.data).not.toHaveProperty("unitCost");
    expect(
      calls.some((c) => c.op === "insert" && c.table === "ingredients"),
    ).toBe(false);
  });

  it.each([
    { supplierName: "New supplier" },
    { unitCost: 1.25 },
    { isAddon: true, addonQuantity: 10 },
  ])(
    "rejects Barista ingredient fields outside the restricted schema: %j",
    async (extra) => {
      const r = await call(
        ingredientList.POST(
          req("POST", "/api/ingredients", "barista-token", {
            name: "Sugar",
            ...extra,
          }),
          undefined,
        ),
      );
      expect(r.status).toBe(400);
      expect(rpcCalls).toHaveLength(0);
      expect(
        calls.some((c) => c.op === "insert" && c.table === "ingredients"),
      ).toBe(false);
    },
  );

  it("returns only active supplier options for Baristas", async () => {
    onRpc = (name) =>
      name === "barista_supplier_options"
        ? {
            data: [
              { supplier_id: 6, supplier_name: "Batangas Barako Traders" },
            ],
          }
        : { data: null };
    const r = await call(
      ingredientSuppliers.GET(
        req("GET", "/api/ingredients/suppliers", "barista-token"),
        undefined,
      ),
    );

    expect(r.status).toBe(200);
    expect(r.body.data).toEqual([
      { id: 6, name: "Batangas Barako Traders" },
    ]);
    expect(rpcCalls.map((rpc) => rpc.name)).toContain(
      "barista_supplier_options",
    );

    const create = await call(
      suppliers.POST(
        req("POST", "/api/suppliers", "barista-token", {
          name: "Barista Cannot Create This",
        }),
        undefined,
      ),
    );
    expect(create.status).toBe(403);
    expect(
      calls.some((c) => c.op === "insert" && c.table === "suppliers"),
    ).toBe(false);
  });

  it.each([
    [{ name: "X", isAddon: true }],
    [{ name: "X", isAddon: true, addonQuantity: 0 }],
    [{ name: "X", isAddon: true, addonQuantity: -2 }],
    [{ name: "X", addonQuantity: 5 }],
  ])("rejects an incomplete add-on configuration %j", async (body) => {
    const r = await call(
      ingredientList.POST(
        req("POST", "/api/ingredients", OWNER, body),
        undefined,
      ),
    );
    expect(r.status).toBe(400);
    expect(calls.some((c) => c.op === "insert")).toBe(false);
  });

  it("disabling an add-on clears its configuration and touches nothing else", async () => {
    onQuery = single;
    const r = await call(
      ingredientById.PATCH(
        req("PATCH", "/api/ingredients/21", OWNER, { isAddon: false }),
        params({ id: "21" }),
      ),
    );
    expect(r.status).toBe(200);
    const update = calls.find((c) => c.op === "update")!;
    expect(update.table).toBe("ingredients");
    expect(update.payload).toEqual({
      is_addon: false,
      addon_selling_price: null,
      addon_quantity: null,
    });
    expect(
      calls.some((c) => ["stock_transactions", "orders"].includes(c.table)),
    ).toBe(false);
  });

  it("does not let a barista change add-on configuration (403)", async () => {
    const r = await call(
      ingredientById.PATCH(
        req("PATCH", "/api/ingredients/21", "barista-token", {
          isAddon: false,
        }),
        params({ id: "21" }),
      ),
    );
    expect(r.status).toBe(403);
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
        req("GET", "/api/reports/daily?from=2026-11-01", OWNER),
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

  it("ranks best sellers within the inclusive Manila date range", async () => {
    onQuery = (query) => {
      if (query.table === "v_sales") {
        return {
          data: [
            { order_line_id: 1, product_id: 5, quantity: 2, subtotal: 160 },
            { order_line_id: 2, product_id: 5, quantity: 1, subtotal: 80 },
            { order_line_id: 3, product_id: 9, quantity: 4, subtotal: 300 },
          ],
        };
      }
      if (query.table === "products") {
        return {
          data: [
            { product_id: 5, product_name: "Latte" },
            { product_id: 9, product_name: "Salabat" },
          ],
        };
      }
      return { data: [] };
    };

    const r = await call(
      reports.GET(
        req(
          "GET",
          "/api/reports/best-sellers?from=2026-10-30&to=2026-11-05&limit=5",
          OWNER,
        ),
        params({ type: "best-sellers" }),
      ),
    );

    expect(r.status).toBe(200);
    expect(r.body.data.rows).toEqual([
      {
        productId: 9,
        productName: "Salabat",
        unitsSold: 4,
        revenue: 300,
        currentUnitCost: null,
      },
      {
        productId: 5,
        productName: "Latte",
        unitsSold: 3,
        revenue: 240,
        currentUnitCost: null,
      },
    ]);
    const salesCall = calls.find((query) => query.table === "v_sales");
    if (!salesCall) throw new Error("Expected a date-filtered sales query.");
    expect(salesCall.filters).toContainEqual([
      "gte",
      ["order_date", "2026-10-30T00:00:00+08:00"],
    ]);
    expect(salesCall.filters).toContainEqual([
      "lt",
      ["order_date", "2026-11-06T00:00:00+08:00"],
    ]);
  });

  it("rejects an unknown report type", async () => {
    const r = await call(
      reports.GET(
        req("GET", "/api/reports/profit", OWNER),
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
