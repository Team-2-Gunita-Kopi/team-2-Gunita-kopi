import {
  IngredientSchema,
  OrderSchema,
  ProductSchema,
  SyncResponseSchema,
  pageOf,
  type SyncOrderItem as ApiSyncOrderItem,
} from "@/contracts";
import { MAX_ORDER_ITEMS, MAX_SYNC_ORDERS, SyncOrderItemSchema } from "@/contracts";
import type { SyncResponse, SyncResultItem } from "@/contracts/ui";
import { apiAllPages, apiData } from "@/staff/lib/api-client";
import { getCatalogWithCache } from "@/staff/offline/catalog-cache";
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
        const order = toApiOrder(o.order);
        // The API refuses more rows; sending it would fail the whole batch on every retry.
        if (order.items.length > MAX_ORDER_ITEMS)
          throw new UnmappableOrderError(
            `This order has more than ${MAX_ORDER_ITEMS} lines. Void it and ring it up as smaller orders.`,
          );
        const item = { transactionId: o.transactionId, order, createdAt: o.createdAt };
        // The API validates a whole chunk at once: one invalid order (e.g. a note over 255
        // characters) would refuse every order in it, on every retry. Hold it back here instead.
        const check = SyncOrderItemSchema.safeParse(item);
        if (!check.success) {
          const issue = check.error.issues[0];
          throw new UnmappableOrderError(
            `This order cannot be saved: ${issue?.path.join(".") || "order"} ${issue?.message ?? "is invalid"}.`,
          );
        }
        sendable.push(item);
      } catch (e) {
        if (!(e instanceof UnmappableOrderError)) throw e;
        local.push({ transactionId: o.transactionId, status: "failed", error: e.message });
      }
    }
    if (sendable.length === 0) return { processedCount: local.length, results: local };
    // The API takes at most MAX_SYNC_ORDERS per request. A failed chunk throws and the whole run is
    // retried; orders already saved come back as "duplicate" (idempotent on clientTxId).
    const remote: SyncResultItem[] = [];
    for (let i = 0; i < sendable.length; i += MAX_SYNC_ORDERS) {
      try {
        const res = await apiData("/api/sync", SyncResponseSchema, {
          method: "POST",
          body: JSON.stringify({ batchId: payload.batchId, orders: sendable.slice(i, i + MAX_SYNC_ORDERS) }),
        });
        remote.push(...res.results.map(toUiSyncResult));
      } catch (e) {
        // Nothing saved yet: let the caller retry everything. Otherwise report what was saved;
        // the unanswered rest stays queued and is retried on the next trigger.
        if (remote.length === 0) throw e;
        break;
      }
    }
    const results = [...remote, ...local];
    return { processedCount: results.length, results } satisfies SyncResponse;
  },

  // FR-08/FR-09: receipt and order slip data.
  getOrder: async (id) =>
    toUiOrder(await apiData(`/api/orders/${encodeURIComponent(id)}`, OrderSchema)),
};
