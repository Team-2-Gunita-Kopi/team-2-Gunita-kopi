import type { Order, PosIngredient, PosProduct, SyncPayload, SyncResponse } from "@gunita/contracts/ui";
import type { MockSettings } from "@gunita/mocks/pos";

export interface PosCatalog {
  products: PosProduct[];
  ingredients: PosIngredient[];
  settings: MockSettings;
  updatedAt: string;
}

export interface PosData {
  getCatalog(): Promise<PosCatalog>;
  /** Pushes outbox orders to the server. Throws when offline. */
  syncOrders(payload: SyncPayload, actor: { id: string; fullName: string }): Promise<SyncResponse>;
  getOrder(id: string): Promise<Order>;
}
