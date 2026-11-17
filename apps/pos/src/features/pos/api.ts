import type { Order, SyncResponse } from "@gunita/contracts";
import { apiClient } from "@/lib/api-client";
import type { PosData } from "./types";

/**
 * The real API has no barista-readable catalog endpoint yet (`GET /api/products` is
 * owner-only and answers 501; `GET /api/ingredients` answers 501 too). Wire `getCatalog` to a
 * POS catalog endpoint once the backend provides one (Task 20 adds the Dexie fallback).
 */
export const data: PosData = {
  getCatalog: async () => {
    throw new Error("Catalog API is not available yet.");
  },
  syncOrders: async (payload) => {
    const res = await apiClient<SyncResponse>("/api/sync", { method: "POST", body: JSON.stringify(payload) });
    if (!res.success || !res.data) throw new Error(res.error?.message || "Sync failed");
    return res.data;
  },
  getOrder: async (id) => {
    const res = await apiClient<Order>(`/api/orders/${encodeURIComponent(id)}`);
    if (!res.success || !res.data) throw new Error(res.error?.message || "Could not load the order");
    return res.data;
  },
};
