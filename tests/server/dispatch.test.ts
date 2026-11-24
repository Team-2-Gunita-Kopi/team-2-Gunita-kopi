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

  // Why: a backend route missing from the table would be unreachable from both areas.
  it("has an entry for every backend route file", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const root = path.resolve(__dirname, "../../src/server/routes");
    const files: string[] = [];
    const walk = (d: string) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name === "route.ts" && files.push(path.join(d, e.name))));
    walk(root);
    const table = fs.readFileSync(path.resolve(__dirname, "../../src/server/dispatch.ts"), "utf8");
    const missing = files
      .map((f) => "./routes/" + path.relative(root, path.dirname(f)).split(path.sep).join("/") + "/route")
      .filter((imp) => !table.includes(`import("${imp}")`) && !imp.startsWith("./routes/mock/"));
    expect(files.length).toBeGreaterThan(20);
    expect(missing).toEqual([]);
  });
});
