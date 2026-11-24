import { env } from "./env";
import { isOnline } from "./connectivity";

type RpcResponse<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

/** Ops that need the network: they fail with `Offline` while the device is offline (real or simulated). */
const OFFLINE_OPS = new Set(["listCatalog", "syncOrders"]);

/** Calls the shared demo data service (apps/api, `POST /api/mock/rpc`). */
export async function mockRpc<T>(op: string, ...args: unknown[]): Promise<T> {
  if (typeof location !== "undefined" && new URLSearchParams(location.search).get("mockFail") === op) {
    throw new Error(`Mock failure (${op})`);
  }
  if (OFFLINE_OPS.has(op) && !isOnline()) throw new Error("Offline");
  let res: Response;
  try {
    res = await fetch(`${env.mockApiUrl}/api/mock/rpc`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ app: "pos", op, args }),
    });
  } catch {
    throw new Error("Can't reach the demo data service on :3002. Is `pnpm dev` running?");
  }
  let body: RpcResponse<T>;
  try {
    body = (await res.json()) as RpcResponse<T>;
  } catch {
    throw new Error("Demo data service returned an unexpected response.");
  }
  if (!body.ok) throw new Error(body.error.message);
  return body.data;
}
