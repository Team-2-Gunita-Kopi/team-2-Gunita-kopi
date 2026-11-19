import { ApiResponse } from "@gunita/contracts";

export type ApiClientOptions = RequestInit;

/**
 * Typed fetch client for the Admin website to communicate with @gunita/api.
 * Calls this site's same-origin /api proxy, which attaches the session from the HttpOnly
 * cookie on the server. Page scripts never handle access tokens.
 */
export async function apiClient<T>(
  endpoint: string,
  options: ApiClientOptions = {},
): Promise<ApiResponse<T>> {
  const headers = new Headers(options.headers);
  // JSON unless the caller sends something else (product image upload).
  if (!headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");

  const url = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: "same-origin",
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

/** Returns `res.data`, or throws the API error message. */
export function unwrap<T>(res: ApiResponse<T>): T {
  if (!res.success) throw new Error(res.error?.message ?? "Request failed");
  return res.data as T;
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

/** Reads every page of a list endpoint (the API caps pageSize at 100). */
export async function apiAllPages<T>(
  endpoint: string,
  schema: ResponseSchema<{ items: T[]; total: number }>,
): Promise<T[]> {
  const sep = endpoint.includes("?") ? "&" : "?";
  const items: T[] = [];
  for (let page = 1; page <= 50; page++) {
    const res = await apiData(
      `${endpoint}${sep}page=${page}&pageSize=100`,
      schema,
    );
    items.push(...res.items);
    if (items.length >= res.total || res.items.length === 0) break;
  }
  return items;
}
