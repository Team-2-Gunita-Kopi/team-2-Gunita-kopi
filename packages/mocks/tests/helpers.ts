import { ADDON_CATALOG, round2 } from "@gunita/contracts";
import type { CreateOrderRequest } from "@gunita/contracts";
import type { MockState } from "../src/store/state";

export const NOW = new Date(2026, 10, 3, 15, 0, 0);
export const USER = { id: "u-juan", fullName: "Juan Dela Cruz" };

export function line(state: MockState, productId: string, quantity: number, addonLabels: string[] = []) {
  const p = state.products.find((x) => x.id === productId)!;
  const addons = addonLabels.map((l) => {
    const a = ADDON_CATALOG.find((x) => x.label === l)!;
    return { ingredientId: a.ingredientId, label: a.label, quantity: a.quantity, price: a.price };
  });
  const sum = addons.reduce((s, a) => s + a.price, 0);
  return {
    productId,
    productName: p.name,
    quantity,
    unitPrice: p.sellingPrice,
    subtotal: round2((p.sellingPrice + sum) * quantity),
    addons,
  };
}

export function req(items: ReturnType<typeof line>[], over: Partial<CreateOrderRequest> = {}): CreateOrderRequest {
  const total = round2(items.reduce((s, i) => s + i.subtotal, 0));
  return {
    clientTxId: "tx-1",
    type: "dine-in",
    items,
    totalAmount: total,
    taxAmount: 0,
    discountAmount: 0,
    paidAmount: total + 10,
    paymentMethod: "cash",
    ...over,
  };
}

export const stockOf = (s: MockState, id: string) => s.ingredients.find((i) => i.id === id)!.currentStock;
