import { ApiResponse } from "@gunita/contracts";
import { supabaseBrowser } from "./supabase-browser";
import { env } from "./env";

export interface ApiClientOptions extends RequestInit {
  token?: string;
}

/**
 * Typed fetch client for the Admin website to communicate with @gunita/api.
 * Automatically attaches Supabase Auth Bearer token if session exists.
 */
export async function apiClient<T>(
  endpoint: string,
  options: ApiClientOptions = {},
): Promise<ApiResponse<T>> {
  const { token, headers: customHeaders, ...restOptions } = options;

  let authToken = token;
  if (!authToken) {
    const { data } = await supabaseBrowser.auth.getSession();
    authToken = data.session?.access_token;
  }

  const headers = new Headers(customHeaders);
  headers.set("Content-Type", "application/json");
  if (authToken) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  const url = `${env.apiUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

  try {
    const response = await fetch(url, {
      ...restOptions,
      headers,
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
