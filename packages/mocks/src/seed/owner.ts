import type { Supplier, UserProfile } from "@gunita/contracts/ui";

const DAY_MS = 86_400_000;

/** Owner-only: a login identity plus its plaintext demo password (kept out of UserProfile). */
export type MockUser = UserProfile & { password: string };

export function seedUsers(now: Date = new Date()): MockUser[] {
  const createdAt = new Date(now.getTime() - 90 * DAY_MS).toISOString();
  const mk = (
    id: string,
    username: string,
    password: string,
    fullName: string,
    role: UserProfile["role"],
  ): MockUser => ({
    id,
    authUserId: id,
    email: `${username}@gunita.local`,
    fullName,
    username,
    role,
    isActive: true,
    createdAt,
    password,
  });
  return [
    mk("u-owner", "owner", "owner123", "Eric Espedilion", "owner_admin"),
    mk("u-juan", "barista", "barista123", "Juan Dela Cruz", "barista"),
    mk("u-maria", "barista2", "barista123", "Maria Santos", "barista"),
  ];
}

export function seedSuppliers(now: Date = new Date()): Supplier[] {
  const createdAt = new Date(now.getTime() - 90 * DAY_MS).toISOString();
  const mk = (
    id: string,
    name: string,
    contactPerson: string,
    phone: string,
    address: string,
    isActive = true,
  ): Supplier => ({ id, name, contactPerson, phone, address, isActive, createdAt });
  return [
    mk("sup-unisilver", "Unisilver PH", "Ramon Mercado", "0917 555 0101", "Manila City"),
    mk("sup-syrups", "Sweet Syrups PH", "Paolo Reyes", "0919 555 0103", "Mandaluyong City"),
    mk("sup-everstock", "Everstock PH", "Liza Aquino", "0918 555 0102", "Laguna BelAir, Sta. Rosa"),
    mk("sup-nova", "Nova Supply", "Jenny Lim", "0920 555 0104", "Quezon City"),
    mk("sup-panaderia", "Panaderia ni Aling Rosa", "Rosa Villanueva", "0921 555 0105", "Brgy. Poblacion, nearby", false),
    mk("sup-palengke", "Palengke Fresh Meats & Produce", "Domingo Cruz", "0922 555 0106", "Public Market, Stall 14"),
  ];
}

// The first seven are the prototype unit costs; the rest are assumed values for
// ingredients the prototype referenced but never seeded.
export function seedUnitCosts(): Record<string, number> {
  return {
    "i-beans": 0.9,
    "i-caramel": 0.5,
    "i-vanilla": 0.5,
    "i-hazelnut": 0.5,
    "i-cup22": 6,
    "i-choc-syrup": 4,
    "i-lid": 2,
    "i-milk": 0.09,
    "i-condensed": 0.15,
    "i-ube": 0.25,
    "i-cup16": 5,
    "i-cup8": 3.5,
    "i-straw": 0.75,
    "i-tablea": 0.4,
    "i-ginger": 0.1,
    "i-ensaymada": 28,
    "i-pandesal": 4,
    "i-bananabread": 22,
    "i-rice": 0.04,
    "i-egg": 9,
    "i-tapa": 0.45,
    "i-longganisa": 0.3,
    "i-chicken": 0.2,
  };
}

/** ingredientId -> supplierId. */
export function seedIngredientSuppliers(): Record<string, string> {
  return {
    "i-beans": "sup-unisilver",
    "i-milk": "sup-unisilver",
    "i-condensed": "sup-unisilver",
    "i-caramel": "sup-syrups",
    "i-vanilla": "sup-syrups",
    "i-hazelnut": "sup-syrups",
    "i-cup22": "sup-everstock",
    "i-cup16": "sup-everstock",
    "i-cup8": "sup-everstock",
    "i-straw": "sup-everstock",
    "i-choc-syrup": "sup-nova",
    "i-lid": "sup-nova",
    "i-ube": "sup-nova",
    "i-tablea": "sup-nova",
    "i-ensaymada": "sup-panaderia",
    "i-pandesal": "sup-panaderia",
    "i-bananabread": "sup-panaderia",
    "i-ginger": "sup-palengke",
    "i-rice": "sup-palengke",
    "i-egg": "sup-palengke",
    "i-tapa": "sup-palengke",
    "i-longganisa": "sup-palengke",
    "i-chicken": "sup-palengke",
  };
}

/** Packaging cost (PHP) per product id, by the prototype's per-category rule. */
export function seedPackaging(products: { id: string; category: string }[]): Record<string, number> {
  const byCategory: Record<string, number> = {
    "Iced Coffee Drinks": 8,
    "Hot Beverages": 6,
    "Pastries & Snacks": 3,
    "Rice Meals": 10,
  };
  return Object.fromEntries(products.map((p) => [p.id, byCategory[p.category] ?? 0]));
}
