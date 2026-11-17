import type { Order, SyncResponse } from "@gunita/contracts";
import { mockRpc } from "@/lib/mock-db";
import { getCatalogWithCache } from "@/offline/catalog-cache";
import type { PosCatalog, PosData } from "./types";

// `listCatalog` throws Error("Offline") while offline; getCatalogWithCache falls back to the Dexie copy.
export const data: PosData = {
  getCatalog: () => getCatalogWithCache(() => mockRpc<PosCatalog>("listCatalog")),
  syncOrders: (payload, actor) => mockRpc<SyncResponse>("syncOrders", payload, actor),
  getOrder: (id) => mockRpc<Order>("getOrder", id),
};
