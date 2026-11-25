// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiClient, apiTiming } from "@/staff/lib/api-client";

afterEach(() => vi.unstubAllGlobals());

describe("POS API client", () => {
  // Why (found 2026-11-25): when the browser says "online" but there is no internet, a request can
  // hang for minutes. It must fail as a network error, so the sync queue is not blocked and the
  // one-minute retry can try again.
  it("gives up on a request the server never answers", async () => {
    const saved = apiTiming.requestTimeoutMs;
    apiTiming.requestTimeoutMs = 30;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) =>
            init.signal?.addEventListener("abort", () => reject(new Error("The operation timed out."))),
          ),
      ),
    );
    try {
      const res = await apiClient("/api/sync", { method: "POST", body: "{}" });
      expect(res.success).toBe(false);
      expect(res.error?.code).toBe("NETWORK_ERROR");
    } finally {
      apiTiming.requestTimeoutMs = saved;
    }
  });
});
