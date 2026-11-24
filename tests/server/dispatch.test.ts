import { describe, expect, it, vi } from "vitest";

// Test-only: server-only refuses to load outside a server bundle.
vi.mock("server-only", () => ({}));

vi.mock("@/server/routes/orders/[id]/route", () => ({
  GET: async (_req: Request, ctx: { params: Promise<Record<string, string>> }) => Response.json(await ctx.params),
}));
vi.mock("@/server/routes/ingredients/suppliers/route", () => ({ GET: async () => Response.json({ route: "suppliers" }) }));
vi.mock("@/server/routes/ingredients/[id]/route", () => ({ GET: async () => Response.json({ route: "ingredient" }) }));

const { dispatchApi } = await import("@/server/dispatch");

// Why: the Owner and POS proxies reach every backend route through this table, in process.
// A wrong match would send a request to the wrong handler or lose its id.
describe("dispatchApi", () => {
  it("passes path params to the handler and echoes a request id", async () => {
    const res = await dispatchApi("/api/orders/42?x=1", { method: "GET", headers: { "x-request-id": "abc-1" } });
    expect(await res.json()).toEqual({ id: "42" });
    expect(res.headers.get("x-request-id")).toBe("abc-1");
  });

  it("matches fixed paths before [id] patterns", async () => {
    expect(await (await dispatchApi("/api/ingredients/suppliers")).json()).toEqual({ route: "suppliers" });
    expect(await (await dispatchApi("/api/ingredients/7")).json()).toEqual({ route: "ingredient" });
  });

  it("answers 404 for unknown routes and 405 for unsupported methods", async () => {
    expect((await dispatchApi("/api/nope")).status).toBe(404);
    expect((await dispatchApi("/api/health", { method: "DELETE" })).status).toBe(405);
  });

  it("replaces an unsafe request id", async () => {
    const res = await dispatchApi("/api/health", { headers: { "x-request-id": "bad id\n" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toMatch(/^req_/);
  });
});
