import type { PosCatalog } from "@/staff/features/pos/types";
import { isOnline } from "@/staff/lib/connectivity";
import { posDb } from "./db";

export const NO_SAVED_MENU = "No saved menu yet. Connect to the internet once to download it.";

const UPDATED_AT_KEY = "catalogUpdatedAt";
const SETTINGS_KEY = "settings";
// Dexie returns rows by primary key; these keep the server's product/ingredient order.
const PRODUCT_ORDER_KEY = "productOrder";
const INGREDIENT_ORDER_KEY = "ingredientOrder";

function inOrder<T extends { id: string }>(rows: T[], ids: unknown): T[] {
  const rank = new Map(((ids as string[] | undefined) ?? []).map((id, i) => [id, i]));
  return [...rows].sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
}

/** Replaces the cached menu (products incl. recipes, ingredients, settings) in one transaction. */
export async function saveCatalog(c: PosCatalog): Promise<void> {
  await posDb.transaction("rw", [posDb.productsCache, posDb.ingredientsCache, posDb.meta], async () => {
    await posDb.productsCache.clear();
    await posDb.ingredientsCache.clear();
    await posDb.productsCache.bulkPut(c.products);
    await posDb.ingredientsCache.bulkPut(c.ingredients);
    await posDb.meta.bulkPut([
      { key: PRODUCT_ORDER_KEY, value: c.products.map((p) => p.id) },
      { key: INGREDIENT_ORDER_KEY, value: c.ingredients.map((i) => i.id) },
      { key: SETTINGS_KEY, value: c.settings },
      { key: UPDATED_AT_KEY, value: c.updatedAt },
    ]);
  });
}

export async function readCatalog(): Promise<PosCatalog | null> {
  const [updatedAt, productOrder, ingredientOrder, settings, products, ingredients] = await Promise.all([
    posDb.meta.get(UPDATED_AT_KEY),
    posDb.meta.get(PRODUCT_ORDER_KEY),
    posDb.meta.get(INGREDIENT_ORDER_KEY),
    posDb.meta.get(SETTINGS_KEY),
    posDb.productsCache.toArray(),
    posDb.ingredientsCache.toArray(),
  ]);
  if (!updatedAt || !settings) return null;
  return {
    products: inOrder(products, productOrder?.value),
    ingredients: inOrder(ingredients, ingredientOrder?.value),
    settings: settings.value as PosCatalog["settings"],
    updatedAt: updatedAt.value as string,
  };
}

/** Online: fetch and cache. Offline or fetch error: the saved copy, or NO_SAVED_MENU when there is none. */
export async function getCatalogWithCache(fetchCatalog: () => Promise<PosCatalog>): Promise<PosCatalog> {
  if (isOnline()) {
    try {
      const fresh = await fetchCatalog();
      await saveCatalog(fresh).catch(() => undefined);
      return fresh;
    } catch {
      // fall through to the saved copy
    }
  }
  const cached = await readCatalog().catch(() => null);
  if (!cached) throw new Error(NO_SAVED_MENU);
  return cached;
}
