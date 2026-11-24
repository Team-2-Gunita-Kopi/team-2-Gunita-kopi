import "server-only";
import { NextRequest } from "next/server";
import { requestIdFrom } from "./lib/request-id";

type Params = Record<string, string>;
type Handler = (
  req: NextRequest,
  ctx: { params: Promise<Params> },
) => Response | Promise<Response>;
type RouteModule = Partial<Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE", Handler>>;

// The backend's route handlers (src/server/routes) are not public URLs. The Owner and POS sites
// reach them through their own /admin/api and /staff/api proxies, which add the user's token from
// the HttpOnly cookie and call this dispatcher in the same process: no second network hop.
// Order matters: fixed paths come before [id] patterns that would also match them.
const ROUTES: [RegExp, string[], () => Promise<unknown>][] = [
  [/^admin\/employees$/, [], () => import("./routes/admin/employees/route")],
  [/^auth\/login$/, [], () => import("./routes/auth/login/route")],
  [/^auth\/otp$/, [], () => import("./routes/auth/otp/route")],
  [/^dashboard$/, [], () => import("./routes/dashboard/route")],
  [/^health$/, [], () => import("./routes/health/route")],
  [/^ingredients$/, [], () => import("./routes/ingredients/route")],
  [/^ingredients\/suppliers$/, [], () => import("./routes/ingredients/suppliers/route")],
  [/^ingredients\/([^/]+)$/, ["id"], () => import("./routes/ingredients/[id]/route")],
  [/^orders$/, [], () => import("./routes/orders/route")],
  [/^orders\/([^/]+)$/, ["id"], () => import("./routes/orders/[id]/route")],
  [/^products$/, [], () => import("./routes/products/route")],
  [/^products\/costing$/, [], () => import("./routes/products/costing/route")],
  [/^products\/([^/]+)$/, ["id"], () => import("./routes/products/[id]/route")],
  [/^products\/([^/]+)\/costing$/, ["id"], () => import("./routes/products/[id]/costing/route")],
  [/^products\/([^/]+)\/image$/, ["id"], () => import("./routes/products/[id]/image/route")],
  [/^products\/([^/]+)\/recipe$/, ["id"], () => import("./routes/products/[id]/recipe/route")],
  [/^reports\/([^/]+)$/, ["type"], () => import("./routes/reports/[type]/route")],
  [/^setup\/owner$/, [], () => import("./routes/setup/owner/route")],
  [/^stock-transactions$/, [], () => import("./routes/stock-transactions/route")],
  [/^suppliers$/, [], () => import("./routes/suppliers/route")],
  [/^suppliers\/([^/]+)$/, ["id"], () => import("./routes/suppliers/[id]/route")],
  [/^sync$/, [], () => import("./routes/sync/route")],
  [/^users$/, [], () => import("./routes/users/route")],
  [/^users\/([^/]+)$/, ["id"], () => import("./routes/users/[id]/route")],
];

const fail = (status: number, code: string, message: string) =>
  Response.json({ success: false, error: { code, message } }, { status });

/** Calls a backend route in process. `path` is "/api/<route>?<query>". */
export async function dispatchApi(path: string, init: RequestInit = {}): Promise<Response> {
  const url = new URL(path, "http://internal");
  const route = url.pathname.replace(/^\/api\//, "");
  for (const [pattern, names, load] of ROUTES) {
    const match = pattern.exec(route);
    if (!match) continue;
    const method = (init.method ?? "GET").toUpperCase() as keyof RouteModule;
    const handler = ((await load()) as RouteModule)[method];
    if (!handler) return fail(405, "METHOD_NOT_ALLOWED", "Method not allowed");
    const params: Params = Object.fromEntries(
      names.map((name, i) => [name, decodeURIComponent(match[i + 1] ?? "")]),
    );
    const headers = new Headers(init.headers);
    const requestId = requestIdFrom(headers.get("x-request-id"));
    headers.set("x-request-id", requestId);
    const res = await handler(new NextRequest(url, { ...init, headers } as ConstructorParameters<typeof NextRequest>[1]), {
      params: Promise.resolve(params),
    });
    res.headers.set("x-request-id", requestId);
    return res;
  }
  return fail(404, "NOT_FOUND", "Not found");
}
