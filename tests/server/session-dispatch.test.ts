import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Test-only: server-only refuses to load outside a server bundle.
vi.mock("server-only", () => ({}));
const SECRET = "s".repeat(32);
vi.mock("@/server/routes/auth/login/route", () => ({
  POST: async (req: Request) =>
    Response.json(
      {
        success: false,
        error: { code: "AUTH_ERROR", message: "Invalid username or password" },
        seen: {
          ip: req.headers.get("x-gunita-client-ip"),
          secret: req.headers.get("x-gunita-proxy-secret") === SECRET,
          body: await req.json(),
        },
      },
      { status: 401 },
    ),
}));
vi.mock("@/server/routes/orders/route", () => ({
  GET: async (req: Request) => Response.json({ success: true, data: { query: new URL(req.url).search } }),
}));

const { createSessionHandlers } = await import("@/auth/session-server");
const { dispatchApi } = await import("@/server/dispatch");

afterEach(() => vi.restoreAllMocks());

const handlers = () =>
  createSessionHandlers({
    supabaseUrl: "http://supabase.local",
    supabaseKey: "publishable-key",
    cookieName: "sb-gunita-pos-auth",
    callApi: dispatchApi,
    proxySecret: SECRET,
    allowedRoles: ["barista"],
    cookiePath: "/staff",
  });

// Why: in the one app, sign-in and every data call reach the backend in process. The client IP,
// the proxy secret, the body and the query string must arrive exactly as they did over HTTP.
describe("session handlers on the in-process backend", () => {
  it("sign-in reaches the backend route with the client IP, proxy secret and body", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await handlers().login(
      new NextRequest("http://shop.local/staff/auth/login", {
        method: "POST",
        headers: { origin: "http://shop.local" },
        body: JSON.stringify({ username: "bea", password: "x" }),
      }),
    );
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.seen).toEqual({ ip: "127.0.0.1", secret: true, body: { username: "bea", password: "x" } });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("the /api proxy dispatches with the query string and refuses dot segments", async () => {
    const h = handlers();
    const ok = await h.proxy(new NextRequest("http://shop.local/staff/api/orders?status=pending"), {
      params: Promise.resolve({ path: ["orders"] }),
    });
    expect((await ok.json()).data).toEqual({ query: "?status=pending" });
    const sneaky = await h.proxy(new NextRequest("http://shop.local/staff/api/x/../setup/owner"), {
      params: Promise.resolve({ path: ["x", "..", "setup", "owner"] }),
    });
    expect(sneaky.status).toBe(404);
  });
});
