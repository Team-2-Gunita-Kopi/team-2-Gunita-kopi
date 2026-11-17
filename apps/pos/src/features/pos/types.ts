import type { PosIngredient, PosProduct } from "@gunita/contracts";
import type { MockSettings } from "@gunita/mocks/pos";

export interface PosCatalog {
  products: PosProduct[];
  ingredients: PosIngredient[];
  settings: MockSettings;
  updatedAt: string;
}

export interface PosData {
  getCatalog(): Promise<PosCatalog>;
}
