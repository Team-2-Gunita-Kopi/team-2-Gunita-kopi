import type { PosIngredient, PosProduct, RecipeIngredient } from "@/contracts/ui";
import { stockStatus } from "@/contracts/ui";

export type MockSettings = {
  shopName: string;
  receiptFooter: string;
  queuePrefix: string;
  autoLogoutMin: number;
};

export function seedSettings(): MockSettings {
  return {
    shopName: "Gunita Kopi",
    receiptFooter: "Salamat po! Come again.",
    queuePrefix: "A",
    autoLogoutMin: 5,
  };
}

const DAY_MS = 86_400_000;

type IngredientDef = {
  id: string;
  name: string;
  unit: string;
  stock: number;
  reorder: number;
};

// The first seven rows are the prototype's seeded ingredients. The rest are
// ingredients its recipes and stock history reference but it never seeded
// (stock follows the Stock History mockup where given, otherwise assumed).
const INGREDIENTS: IngredientDef[] = [
  { id: "i-beans", name: "Coffee beans", unit: "g", stock: 2900, reorder: 800 },
  { id: "i-caramel", name: "Caramel syrup", unit: "mL", stock: 650, reorder: 300 },
  { id: "i-vanilla", name: "Vanilla syrup", unit: "mL", stock: 600, reorder: 300 },
  { id: "i-hazelnut", name: "Hazelnut syrup", unit: "mL", stock: 0, reorder: 250 },
  { id: "i-cup22", name: "22oz iced cups", unit: "pcs", stock: 120, reorder: 100 },
  { id: "i-choc-syrup", name: "Chocolate syrup", unit: "pcs", stock: 140, reorder: 80 },
  { id: "i-lid", name: "Cup lids", unit: "pcs", stock: 140, reorder: 150 },
  { id: "i-milk", name: "Fresh milk", unit: "mL", stock: 2800, reorder: 1000 },
  { id: "i-condensed", name: "Condensed milk", unit: "mL", stock: 900, reorder: 300 },
  { id: "i-ube", name: "Ube halaya", unit: "g", stock: 500, reorder: 200 },
  { id: "i-cup16", name: "16oz iced cups", unit: "pcs", stock: 200, reorder: 100 },
  { id: "i-cup8", name: "8oz hot cups", unit: "pcs", stock: 140, reorder: 100 },
  { id: "i-straw", name: "Straws", unit: "pcs", stock: 300, reorder: 100 },
  { id: "i-tablea", name: "Tablea", unit: "g", stock: 800, reorder: 300 },
  { id: "i-ginger", name: "Ginger", unit: "g", stock: 400, reorder: 150 },
  { id: "i-ensaymada", name: "Ensaymada", unit: "pcs", stock: 24, reorder: 10 },
  { id: "i-pandesal", name: "Pandesal", unit: "pcs", stock: 60, reorder: 30 },
  { id: "i-bananabread", name: "Banana bread", unit: "pcs", stock: 15, reorder: 6 },
  { id: "i-rice", name: "Rice", unit: "g", stock: 6000, reorder: 2000 },
  { id: "i-egg", name: "Eggs", unit: "pcs", stock: 32, reorder: 12 },
  { id: "i-tapa", name: "Beef tapa", unit: "g", stock: 1500, reorder: 500 },
  { id: "i-longganisa", name: "Longganisa", unit: "g", stock: 700, reorder: 300 },
  { id: "i-chicken", name: "Chicken", unit: "g", stock: 2000, reorder: 600 },
];

export function seedIngredients(now: Date = new Date()): PosIngredient[] {
  const updatedAt = new Date(now.getTime() - 2 * DAY_MS).toISOString();
  return INGREDIENTS.map((d) => ({
    id: d.id,
    name: d.name,
    unit: d.unit,
    currentStock: d.stock,
    minimumStock: d.reorder,
    isLowStock: stockStatus(d.stock, d.reorder) !== "ok",
    updatedAt,
  }));
}

type Recipe = Array<[string, number]>;
type ProductDef = {
  id: string;
  name: string;
  category: string;
  price: number;
  description: string;
  recipe: Recipe;
};

const ICED_PACK: Recipe = [["i-cup16", 1], ["i-lid", 1], ["i-straw", 1]];
const HOT_PACK: Recipe = [["i-cup8", 1], ["i-lid", 1]];
const iced = (id: string, name: string, price: number, extra: Recipe, description: string): ProductDef => ({
  id, name, category: "Iced Coffee Drinks", price, description, recipe: [...extra, ...ICED_PACK],
});
const hot = (id: string, name: string, price: number, extra: Recipe, description: string): ProductDef => ({
  id, name, category: "Hot Beverages", price, description, recipe: [...extra, ...HOT_PACK],
});
const pastry = (id: string, name: string, price: number, ing: string, qty: number, description: string): ProductDef => ({
  id, name, category: "Pastries & Snacks", price, description, recipe: [[ing, qty]],
});
const rice = (id: string, name: string, price: number, ing: string, qty: number, description: string): ProductDef => ({
  id, name, category: "Rice Meals", price, description, recipe: [["i-rice", 200], ["i-egg", 1], [ing, qty]],
});

const PRODUCTS: ProductDef[] = [
  iced("p-iced-spanish-latte", "Iced Spanish Latte", 145, [["i-beans", 18], ["i-milk", 150], ["i-condensed", 15]], "Condensed-milk classic, 16oz"),
  iced("p-iced-caramel-macchiato", "Iced Caramel Macchiato", 150, [["i-beans", 18], ["i-milk", 150], ["i-caramel", 30]], "Caramel drizzle over milk, 16oz"),
  iced("p-iced-ube-latte", "Iced Ube Latte", 155, [["i-beans", 18], ["i-milk", 150], ["i-ube", 30]], "Ube halaya + espresso, 16oz"),
  iced("p-iced-americano", "Iced Americano", 110, [["i-beans", 18]], "Straight espresso over ice, 16oz"),
  iced("p-iced-hazelnut-latte", "Iced Hazelnut Latte", 150, [["i-beans", 18], ["i-milk", 150], ["i-hazelnut", 30]], "Hazelnut syrup latte, 16oz"),
  hot("p-kapeng-barako", "Kapeng Barako", 85, [["i-beans", 20]], "Batangas bold brew, 8oz"),
  hot("p-hot-caf-latte", "Hot Café Latte", 120, [["i-beans", 18], ["i-milk", 180]], "Smooth milk espresso, 8oz"),
  hot("p-tablea-hot-chocolate", "Tablea Hot Chocolate", 130, [["i-tablea", 40], ["i-milk", 150]], "Thick tsokolate, 8oz"),
  hot("p-salabat", "Salabat", 75, [["i-ginger", 30]], "Warming ginger tea, 8oz"),
  pastry("p-ensaymada", "Ensaymada", 70, "i-ensaymada", 1, "Cheesy brioche"),
  pastry("p-cheese-pandesal-3-pcs", "Cheese Pandesal (3 pcs)", 55, "i-pandesal", 3, "Fresh-baked, melty cheese"),
  pastry("p-banana-bread", "Banana Bread", 60, "i-bananabread", 1, "Moist loaf slice"),
  rice("p-tapsilog", "Tapsilog", 150, "i-tapa", 120, "Beef tapa, garlic rice, egg"),
  rice("p-longsilog", "Longsilog", 140, "i-longganisa", 120, "Longganisa, garlic rice, egg"),
  rice("p-chicken-adobo-with-rice", "Chicken Adobo with Rice", 160, "i-chicken", 180, "Classic adobo, rice"),
];

export function seedProducts(now: Date = new Date()): PosProduct[] {
  const byId = new Map(INGREDIENTS.map((i) => [i.id, i]));
  const createdAt = new Date(now.getTime() - 90 * DAY_MS).toISOString();
  return PRODUCTS.map((d) => ({
    id: d.id,
    name: d.name,
    category: d.category,
    sellingPrice: d.price,
    description: d.description,
    isActive: true,
    createdAt,
    ingredients: d.recipe.map(([ingredientId, quantity]): RecipeIngredient => {
      const ing = byId.get(ingredientId);
      return { ingredientId, ingredientName: ing?.name, quantity, unit: ing?.unit ?? "pcs" };
    }),
  }));
}
