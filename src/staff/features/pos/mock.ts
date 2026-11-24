import type { Order, SyncResponse } from "@/contracts/ui";
import { mockRpc } from "@/staff/lib/mock-db";
import { getCatalogWithCache } from "@/staff/offline/catalog-cache";
import type { PosCatalog, PosData } from "./types";

// `listCatalog` throws Error("Offline") while offline; getCatalogWithCache falls back to the Dexie copy.
export const data: PosData = {
  getCatalog: () => getCatalogWithCache(() => mockRpc<PosCatalog>("listCatalog")),
  syncOrders: (payload, actor) => mockRpc<SyncResponse>("syncOrders", payload, actor),
  getOrder: (id) => mockRpc<Order>("getOrder", id),
};
