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
