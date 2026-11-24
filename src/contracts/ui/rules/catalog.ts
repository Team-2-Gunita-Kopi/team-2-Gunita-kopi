export const PRODUCT_CATEGORIES = [
  "Iced Coffee Drinks",
  "Hot Beverages",
  "Pastries & Snacks",
  "Rice Meals",
] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export type RecipeLine = { ingredientId: string; quantity: number };

export function isOrderable(
  product: { isActive: boolean },
  recipe: RecipeLine[],
  stockById: Record<string, number>,
): { orderable: boolean; reason?: "unavailable" | "out_of_stock" } {
  if (!product.isActive) return { orderable: false, reason: "unavailable" };
  const short = recipe.some((l) => (stockById[l.ingredientId] ?? 0) < l.quantity);
  return short ? { orderable: false, reason: "out_of_stock" } : { orderable: true };
}

export type AddonDef = {
  ingredientId: string;
  label: string;
  quantity: number;
  price: number;
  categories: ProductCategory[];
  requiresInRecipe?: boolean;
};

export const ADDON_CATALOG: AddonDef[] = [
  { ingredientId: "i-beans", label: "Extra shot", quantity: 18, price: 25, categories: ["Iced Coffee Drinks", "Hot Beverages"], requiresInRecipe: true },
  { ingredientId: "i-caramel", label: "Caramel syrup", quantity: 15, price: 15, categories: ["Iced Coffee Drinks"] },
  { ingredientId: "i-vanilla", label: "Vanilla syrup", quantity: 15, price: 15, categories: ["Iced Coffee Drinks"] },
  { ingredientId: "i-hazelnut", label: "Hazelnut syrup", quantity: 15, price: 15, categories: ["Iced Coffee Drinks"] },
  { ingredientId: "i-milk", label: "Extra milk", quantity: 60, price: 15, categories: ["Iced Coffee Drinks", "Hot Beverages"] },
  { ingredientId: "i-rice", label: "Extra rice", quantity: 150, price: 20, categories: ["Rice Meals"] },
  { ingredientId: "i-egg", label: "Extra egg", quantity: 1, price: 15, categories: ["Rice Meals"] },
];

export function addonsFor(
  category: string,
  recipe: RecipeLine[],
  stockById: Record<string, number>,
): (AddonDef & { disabled: boolean })[] {
  return ADDON_CATALOG.filter(
    (a) =>
      (a.categories as string[]).includes(category) &&
      (!a.requiresInRecipe || recipe.some((l) => l.ingredientId === a.ingredientId)),
  ).map((a) => ({ ...a, disabled: (stockById[a.ingredientId] ?? 0) < a.quantity }));
}

/**
 * Real-mode add-ons: inventory ingredients configured as POS add-ons (one selection each). The
 * caller offers them for drinks only. Disabled when the stock left is below one selection; checkout
 * rechecks configuration, price and stock on the server.
 */
export function inventoryAddons(
  ingredients: { id: string; name: string; currentStock: number; addon?: { price: number; quantity: number } }[],
): { ingredientId: string; label: string; quantity: number; price: number; disabled: boolean }[] {
  return ingredients.flatMap((i) =>
    i.addon
      ? [{ ingredientId: i.id, label: i.name, quantity: 1, price: i.addon.price, disabled: i.currentStock < i.addon.quantity }]
      : [],
  );
}

export const QUICK_CHIPS: Record<ProductCategory, string[]> = {
  "Iced Coffee Drinks": ["Sugar 0%", "Sugar 25%", "Sugar 50%", "Sugar 75%", "Sugar 100%", "Less ice", "No ice"],
  "Hot Beverages": ["Sugar 0%", "Sugar 25%", "Sugar 50%", "Sugar 75%", "Sugar 100%", "Extra hot"],
  "Rice Meals": ["Sunny side up", "Scrambled egg", "Plain rice"],
  "Pastries & Snacks": ["Heated", "Sliced"],
};
