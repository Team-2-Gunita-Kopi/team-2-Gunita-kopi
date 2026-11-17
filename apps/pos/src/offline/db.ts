import Dexie, { type EntityTable } from "dexie";
import { CreateOrderRequest, OutboxStatus } from "@gunita/contracts";

export interface OutboxOrderRecord {
  id?: number;
  clientTxId: string;
  order: CreateOrderRequest;
  status: OutboxStatus;
  retryCount: number;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  syncedAt?: string;
  /** Provisional queue number (OFF-001) shown until the server assigns the real one. */
  provisionalNo?: string;
  /** Server order id once synced. */
  serverOrderId?: string;
}

export interface MetaRecord {
  key: string;
  value: unknown;
}

export interface CachedProduct {
  id: string;
  name: string;
  category: string;
  sellingPrice: number;
  imageUrl?: string;
  cachedAt: string;
}

export interface CachedIngredient {
  id: string;
  name: string;
  currentStock: number;
  unit: string;
  cachedAt: string;
}

export class GunitaPosDB extends Dexie {
  ordersOutbox!: EntityTable<OutboxOrderRecord, "clientTxId">;
  productsCache!: EntityTable<CachedProduct, "id">;
  ingredientsCache!: EntityTable<CachedIngredient, "id">;
  meta!: EntityTable<MetaRecord, "key">;

  constructor() {
    super("GunitaPosDB");
    this.version(1).stores({
      ordersOutbox: "clientTxId, status, createdAt",
      productsCache: "id, category, name",
      ingredientsCache: "id, name",
    });
    this.version(2).stores({
      ordersOutbox: "clientTxId, status, createdAt",
      productsCache: "id, category, name",
      ingredientsCache: "id, name",
      meta: "key",
    });
  }
}

export const posDb = new GunitaPosDB();
