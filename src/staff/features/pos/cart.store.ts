import { create } from "zustand";
import { addLine, orderTotal, type CartLine, type PosProduct } from "@/contracts/ui";

type LinePatch = Partial<Pick<CartLine, "addons" | "customization" | "specialInstructions">>;

export interface CartState {
  lines: CartLine[];
  add(p: PosProduct): void;
  increment(lineId: string): void;
  decrement(lineId: string): void;
  remove(lineId: string): void;
  updateLine(lineId: string, patch: LinePatch): void;
  clear(): void;
}

const newLineId = () => globalThis.crypto.randomUUID();

export const useCartStore = create<CartState>((set) => ({
  lines: [],
  add: (p) => set((s) => ({ lines: addLine(s.lines, p, newLineId) })),
  increment: (lineId) =>
    set((s) => ({ lines: s.lines.map((l) => (l.lineId === lineId ? { ...l, quantity: l.quantity + 1 } : l)) })),
  decrement: (lineId) =>
    set((s) => ({
      lines: s.lines.flatMap((l) => (l.lineId !== lineId ? [l] : l.quantity > 1 ? [{ ...l, quantity: l.quantity - 1 }] : [])),
    })),
  remove: (lineId) => set((s) => ({ lines: s.lines.filter((l) => l.lineId !== lineId) })),
  updateLine: (lineId, patch) =>
    set((s) => ({ lines: s.lines.map((l) => (l.lineId === lineId ? { ...l, ...patch } : l)) })),
  clear: () => set({ lines: [] }),
}));

export const selectTotal = (s: CartState): number => orderTotal(s.lines);
export const selectCount = (s: CartState): number => s.lines.reduce((n, l) => n + l.quantity, 0);
