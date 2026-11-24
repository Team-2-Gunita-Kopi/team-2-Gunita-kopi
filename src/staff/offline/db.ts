import Dexie, { type EntityTable } from "dexie";
import type { CreateOrderRequest, OutboxStatus, PosIngredient, PosProduct } from "@/contracts/ui";

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
  /** Real queue number returned by the server on sync. */
  orderNumber?: string;
  /** True when the server rejected the order (e.g. stock gone); not resubmitted until retryOrder. */
  rejected?: boolean;
}

export interface MetaRecord {
  key: string;
  value: unknown;
}

export class GunitaPosDB extends Dexie {
  ordersOutbox!: EntityTable<OutboxOrderRecord, "clientTxId">;
  productsCache!: EntityTable<PosProduct, "id">;
  ingredientsCache!: EntityTable<PosIngredient, "id">;
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
    // v3: productsCache/ingredientsCache now hold the full PosProduct (incl. recipe) / PosIngredient.
    // Index definitions are unchanged, so existing outbox/meta rows are kept as they are.
    this.version(3).stores({
      ordersOutbox: "clientTxId, status, createdAt",
      productsCache: "id, category, name",
      ingredientsCache: "id, name",
      meta: "key",
    });
  }
}

export const posDb = new GunitaPosDB();
