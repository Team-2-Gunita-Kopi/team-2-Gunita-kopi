import type { OrderAddon, OrderItem } from "../orders";
import { round2 } from "./money";

export type CartLine = {
  lineId: string;
  productId: string;
  productName: string;
  category: string;
  unitPrice: number;
  quantity: number;
  addons: OrderAddon[];
  customization: string;
  specialInstructions: string;
};

export function isPlainLine(l: CartLine): boolean {
  return (
    l.addons.length === 0 &&
    l.customization === "" &&
    l.specialInstructions === ""
  );
}

/** R-B1: increment an existing plain line of the same product, else append a new plain line. */
export function addLine(
  lines: CartLine[],
  p: { id: string; name: string; category: string; sellingPrice: number },
  makeId: () => string,
): CartLine[] {
  const idx = lines.findIndex((l) => l.productId === p.id && isPlainLine(l));
  if (idx >= 0) {
    return lines.map((l, i) =>
      i === idx ? { ...l, quantity: l.quantity + 1 } : l,
    );
  }
  return [
    ...lines,
    {
      lineId: makeId(),
      productId: p.id,
      productName: p.name,
      category: p.category,
      unitPrice: p.sellingPrice,
      quantity: 1,
      addons: [],
      customization: "",
      specialInstructions: "",
    },
  ];
}

/** Price of one order line: (unit price + add-on prices) x quantity, rounded to 2dp. */
export function itemTotal(item: { unitPrice: number; quantity: number; addons?: OrderAddon[] }): number {
  const addons = (item.addons ?? []).reduce((s, a) => s + a.price, 0);
  return round2((item.unitPrice + addons) * item.quantity);
}

export function lineTotal(l: CartLine): number {
  return itemTotal(l);
}

export function orderTotal(lines: CartLine[]): number {
  return round2(lines.reduce((s, l) => s + lineTotal(l), 0));
}

export function toOrderItems(lines: CartLine[]): OrderItem[] {
  return lines.map((l) => ({
    productId: l.productId,
    productName: l.productName,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    subtotal: lineTotal(l),
    addons: l.addons,
    customization: l.customization,
    specialInstructions: l.specialInstructions,
  }));
}

export function computeChange(
  total: number,
  paid: number,
):
  | { ok: true; change: number }
  | { ok: false; error: "Amount paid is less than the total." } {
  const change = round2(paid - total);
  if (!Number.isFinite(total) || !Number.isFinite(paid) || change < 0) return { ok: false, error: "Amount paid is less than the total." };
  return { ok: true, change };
}

export function parseAmount(input: string): number | null {
  const s = input.replace(/,/g, "").trim();
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
