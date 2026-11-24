export type StockStatus = "ok" | "low" | "out_of_stock";

export const STOCK_STATUS_LABEL: Record<StockStatus, string> = {
  ok: "In Stock",
  low: "Low",
  out_of_stock: "Out",
};

export function stockStatus(currentStock: number, minimumStock: number): StockStatus {
  if (currentStock <= 0) return "out_of_stock";
  if (currentStock <= minimumStock) return "low";
  return "ok";
}

const URGENCY: Record<StockStatus, number> = { out_of_stock: 0, low: 1, ok: 2 };

export function sortByStockUrgency<T extends { currentStock: number; minimumStock: number; name: string }>(
  items: T[],
): T[] {
  return [...items].sort(
    (a, b) =>
      URGENCY[stockStatus(a.currentStock, a.minimumStock)] -
        URGENCY[stockStatus(b.currentStock, b.minimumStock)] || a.name.localeCompare(b.name),
  );
}
