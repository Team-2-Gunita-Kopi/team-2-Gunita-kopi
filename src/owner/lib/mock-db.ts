import { env } from "./env";

type RpcResponse<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

/** Calls the shared demo data service (`POST /api/mock/rpc` in this app). */
export async function mockRpc<T>(op: string, ...args: unknown[]): Promise<T> {
  if (typeof location !== "undefined" && new URLSearchParams(location.search).get("mockFail") === op) {
    throw new Error(`Mock failure (${op})`);
  }
  let res: Response;
  try {
    res = await fetch(`${env.mockApiUrl}/api/mock/rpc`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ app: "owner", op, args }),
    });
  } catch {
    throw new Error("Can't reach the demo data service. Is `pnpm dev` running with MOCK_MODE=true?");
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
