import { ApiResponse } from "@/contracts";
import { withBasePath } from "./base-path";

export type ApiClientOptions = RequestInit;

/**
 * A request with no answer gives up after this long. The browser can report "online" while
 * there is no internet (e.g. Windows with virtual network adapters), and such a request would
 * otherwise hang for minutes and hold up the sync queue.
 */
export const apiTiming = { requestTimeoutMs: 15_000 };

/**
 * Typed fetch client for the POS website to communicate with @gunita/api.
 * Calls this site's same-origin /api proxy, which attaches the session from the HttpOnly
 * cookie on the server. Page scripts never handle access tokens.
 */
export async function apiClient<T>(
  endpoint: string,
  options: ApiClientOptions = {},
): Promise<ApiResponse<T>> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");

  const url = withBasePath(
    endpoint.startsWith("/") ? endpoint : `/${endpoint}`,
  );

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: "same-origin",
      signal: options.signal ?? AbortSignal.timeout(apiTiming.requestTimeoutMs),
    });

    const data = (await response.json()) as ApiResponse<T>;
    return data;
  } catch (error) {
    return {
      success: false,
      error: {
        code: "NETWORK_ERROR",
        message:
          error instanceof Error ? error.message : "Network request failed",
      },
    };
  }
}

/** Any schema with zod's safeParse (the API contracts in @gunita/contracts). */
export interface ResponseSchema<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

/**
 * Calls the API and validates `data` against the API contract. Throws the API's own (generic)
 * message on failure, or a fixed message when the response does not match the contract.
 */
export async function apiData<T>(
  endpoint: string,
  schema: ResponseSchema<T>,
  options: ApiClientOptions = {},
): Promise<T> {
  const res = await apiClient<unknown>(endpoint, options);
  if (!res.success) throw new Error(res.error?.message ?? "Request failed");
  const parsed = schema.safeParse(res.data);
  if (!parsed.success) throw new Error("Unexpected response from the server");
  return parsed.data;
}

/** Reads every page of a list endpoint (the API caps pageSize at 100, this reads at most 50 pages). */
export async function apiAllPages<T>(
  endpoint: string,
  schema: ResponseSchema<{ items: T[]; total: number }>,
): Promise<T[]> {
  const sep = endpoint.includes("?") ? "&" : "?";
  const page = (n: number) => apiData(`${endpoint}${sep}page=${n}&pageSize=100`, schema);
  // Speed: page 1 gives the total; the remaining pages load in parallel, not one after another.
  const first = await page(1);
  const pages = Math.min(50, Math.ceil(first.total / 100));
  const rest = await Promise.all(Array.from({ length: Math.max(0, pages - 1) }, (_, i) => page(i + 2)));
  return [first, ...rest].flatMap((r) => r.items);
}
