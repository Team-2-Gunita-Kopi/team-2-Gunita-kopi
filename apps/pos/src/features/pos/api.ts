import {
  IngredientSchema,
  OrderSchema,
  ProductSchema,
  SyncResponseSchema,
  pageOf,
  type SyncOrderItem as ApiSyncOrderItem,
} from "@gunita/contracts";
import type { SyncResponse, SyncResultItem } from "@gunita/contracts/ui";
import { apiAllPages, apiData } from "@/lib/api-client";
import { getCatalogWithCache } from "@/offline/catalog-cache";
import {
  UnmappableOrderError,
  toApiOrder,
  toPosIngredient,
  toPosProduct,
  toUiOrder,
  toUiSyncResult,
} from "./api-mappers";
import type { PosData } from "./types";

// Receipt and idle-logout settings. The SRS leaves the inactivity period open (OI-06); 5 minutes
// matches the POS layout's IdleLogout.
const SETTINGS = {
  shopName: "Gunita Kopi",
  receiptFooter: "Salamat po! Come again.",
  queuePrefix: "",
  autoLogoutMin: 5,
};

export const data: PosData = {
  // FR-05/FR-55: available products and the inventory (for stock badges), cached for offline use.
  getCatalog: () =>
    getCatalogWithCache(async () => {
      const [products, ingredients] = await Promise.all([
        apiAllPages("/api/products?available=true", pageOf(ProductSchema)),
        apiAllPages("/api/ingredients", pageOf(IngredientSchema)),
      ]);
      return {
        products: products.map(toPosProduct),
        ingredients: ingredients.map(toPosIngredient),
        settings: SETTINGS,
        updatedAt: new Date().toISOString(),
      };
    }),

  // FR-56 to FR-60: outbox orders go to POST /api/sync, which saves each once (clientTxId).
  syncOrders: async (payload) => {
    const sendable: ApiSyncOrderItem[] = [];
    const local: SyncResultItem[] = [];
    for (const o of payload.orders) {
      try {
        sendable.push({ transactionId: o.transactionId, order: toApiOrder(o.order), createdAt: o.createdAt });
      } catch (e) {
        if (!(e instanceof UnmappableOrderError)) throw e;
        local.push({ transactionId: o.transactionId, status: "failed", error: e.message });
      }
    }
    if (sendable.length === 0) return { processedCount: local.length, results: local };
    const res = await apiData("/api/sync", SyncResponseSchema, {
      method: "POST",
      body: JSON.stringify({ batchId: payload.batchId, orders: sendable }),
    });
    const results = [...res.results.map(toUiSyncResult), ...local];
    return { processedCount: results.length, results } satisfies SyncResponse;
  },

  // FR-08/FR-09: receipt and order slip data.
  getOrder: async (id) =>
    toUiOrder(await apiData(`/api/orders/${encodeURIComponent(id)}`, OrderSchema)),
};
