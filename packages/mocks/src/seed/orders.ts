import { ADDON_CATALOG, nextQueueNo, round2 } from "@gunita/contracts";
import type { Order, OrderItem, OrderStatus, OrderType, PosProduct, StockTransaction } from "@gunita/contracts";
import { seedProducts, seedSettings } from "./catalog";
import { seedUsers } from "./owner";

type Rng = () => number;
type Queue = { day: string; seq: number };

const PREV_DAYS = 6;
const RANDOM_TODAY = 8;

function at(now: Date, daysBack: number, h: number, m: number): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysBack, h, m, 0);
}

function pick<T>(rng: Rng, xs: T[]): T {
  return xs[Math.floor(rng() * xs.length)] as T;
}

function lineFor(
  product: PosProduct,
  quantity: number,
  extras: { customization?: string; specialInstructions?: string; addonIngredientId?: string },
): OrderItem {
  const addonDef = extras.addonIngredientId
    ? ADDON_CATALOG.find((a) => a.ingredientId === extras.addonIngredientId)
    : undefined;
  const addons = addonDef
    ? [{ ingredientId: addonDef.ingredientId, label: addonDef.label, quantity: addonDef.quantity, price: addonDef.price }]
    : [];
  const addonSum = addons.reduce((s, a) => s + a.price, 0);
  return {
    productId: product.id,
    productName: product.name,
    quantity,
    unitPrice: product.sellingPrice,
    subtotal: round2((product.sellingPrice + addonSum) * quantity),
    addons,
    customization: extras.customization ?? "",
    specialInstructions: extras.specialInstructions ?? "",
  };
}

function makeOrder(args: {
  queueNo: string;
  when: Date;
  status: OrderStatus;
  type: OrderType;
  items: OrderItem[];
  paid: number;
  cashier: { id: string; fullName: string };
}): Order {
  const total = round2(args.items.reduce((s, i) => s + i.subtotal, 0));
  const cancelled = args.status === "cancelled";
  return {
    id: `ord-${args.queueNo}`,
    clientTxId: `seed-${args.queueNo}`,
    orderNumber: args.queueNo,
    status: args.status,
    type: args.type,
    items: args.items,
    totalAmount: total,
    taxAmount: 0,
    discountAmount: 0,
    paidAmount: cancelled ? 0 : args.paid,
    changeAmount: cancelled ? 0 : round2(args.paid - total),
    paymentMethod: "cash",
    createdAt: args.when.toISOString(),
    createdBy: args.cashier.id,
    cashierName: args.cashier.fullName,
  };
}

function roundUpPaid(total: number): number {
  return total <= 100 ? 100 : Math.ceil(total / 50) * 50;
}

function randomOrder(rng: Rng, products: PosProduct[], when: Date, queueNo: string, cashiers: { id: string; fullName: string }[]): Order {
  const lineCount = 1 + Math.floor(rng() * 3);
  const items: OrderItem[] = [];
  for (let i = 0; i < lineCount; i++) {
    const product = pick(rng, products);
    const hasBeans = product.ingredients?.some((r) => r.ingredientId === "i-beans") ?? false;
    const addonChoices = ADDON_CATALOG.filter(
      (a) => (a.categories as string[]).includes(product.category) && (!a.requiresInRecipe || hasBeans),
    );
    const addonIngredientId = rng() < 0.2 && addonChoices.length > 0 ? pick(rng, addonChoices).ingredientId : undefined;
    items.push(lineFor(product, 1 + Math.floor(rng() * 2), { addonIngredientId }));
  }
  const total = round2(items.reduce((s, it) => s + it.subtotal, 0));
  const r = rng();
  const type: OrderType = r < 0.45 ? "dine-in" : r < 0.95 ? "take-out" : "pre-order";
  const status: OrderStatus = rng() < 0.08 ? "cancelled" : "completed";
  return makeOrder({ queueNo, when, status, type, items, paid: roundUpPaid(total), cashier: pick(rng, cashiers) });
}

export function seedOrders(now: Date, rng: Rng): { orders: Order[]; queue: Queue } {
  const products = seedProducts(now);
  const byId = new Map(products.map((p) => [p.id, p]));
  const prod = (id: string) => byId.get(id) as PosProduct;
  const users = seedUsers(now);
  const cashiers = users.filter((u) => u.role === "barista").map((u) => ({ id: u.id, fullName: u.fullName }));
  const userRef = (id: string) => {
    const u = users.find((x) => x.id === id) as (typeof users)[number];
    return { id: u.id, fullName: u.fullName };
  };
  const juan = userRef("u-juan");
  const prefix = seedSettings().queuePrefix;
  const maria = userRef("u-maria");

  const orders: Order[] = [];
  let queue: Queue | null = null;
  const nextNo = (day: Date): string => {
    const n = nextQueueNo(queue, day, prefix);
    queue = { day: n.day, seq: n.seq };
    return n.queueNo;
  };

  // Prior days: oldest first, each day's seq restarts at 1.
  for (let back = PREV_DAYS; back >= 1; back--) {
    const count = 6 + Math.floor(rng() * 5);
    const times = Array.from({ length: count }, () => 7 * 60 + Math.floor(rng() * 12 * 60)).sort((a, b) => a - b);
    for (const t of times) {
      const when = at(now, back, Math.floor(t / 60), t % 60);
      orders.push(randomOrder(rng, products, when, nextNo(when), cashiers));
    }
  }

  // Today: eight random morning orders, then the four prototype sample orders (009-012).
  const morning = Array.from({ length: RANDOM_TODAY }, () => 7 * 60 + Math.floor(rng() * 5 * 60)).sort((a, b) => a - b);
  for (const t of morning) {
    const when = at(now, 0, Math.floor(t / 60), t % 60);
    orders.push(randomOrder(rng, products, when, nextNo(when), cashiers));
  }

  const sample = (
    h: number,
    m: number,
    status: OrderStatus,
    type: OrderType,
    cashier: { id: string; fullName: string },
    paid: number,
    items: OrderItem[],
  ) => {
    const when = at(now, 0, h, m);
    orders.push(makeOrder({ queueNo: nextNo(when), when, status, type, items, paid, cashier }));
  };
  sample(12, 16, "completed", "take-out", maria, 300, [
    lineFor(prod("p-tapsilog"), 1, { customization: "Sunny side up" }),
    lineFor(prod("p-kapeng-barako"), 1, { customization: "Extra hot" }),
    lineFor(prod("p-banana-bread"), 1, {}),
  ]);
  sample(12, 47, "pending", "take-out", juan, 300, [
    lineFor(prod("p-iced-americano"), 1, { customization: "Less ice" }),
    lineFor(prod("p-iced-spanish-latte"), 1, { customization: "Sugar 25%", specialInstructions: "Serve last" }),
  ]);
  sample(12, 59, "pending", "take-out", juan, 500, [
    lineFor(prod("p-longsilog"), 2, { customization: "Scrambled egg" }),
    lineFor(prod("p-ensaymada"), 2, { customization: "Heated" }),
  ]);
  sample(14, 22, "preparing", "dine-in", juan, 200, [
    lineFor(prod("p-iced-spanish-latte"), 1, {
      customization: "Sugar 50%",
      specialInstructions: "No lid",
      addonIngredientId: "i-hazelnut",
    }),
  ]);

  return { orders, queue: queue ?? { day: "", seq: 0 } };
}

/** The prototype's nine Stock History rows, placed relative to `now`. */
export function seedStockTx(now: Date): StockTransaction[] {
  const users = seedUsers(now);
  const nameOf = (id: string) => (users.find((u) => u.id === id)?.fullName as string);
  const juan = nameOf("u-juan");
  const eric = nameOf("u-owner");
  const names: Record<string, string> = {
    "i-caramel": "Caramel syrup",
    "i-vanilla": "Vanilla syrup",
    "i-cup8": "8oz hot cups",
    "i-milk": "Fresh milk",
    "i-tablea": "Tablea",
    "i-egg": "Eggs",
    "i-longganisa": "Longganisa",
    "i-ube": "Ube halaya",
  };
  const row = (
    n: number,
    ingredientId: string,
    kind: "in" | "out",
    qty: number,
    remaining: number,
    when: Date,
    by: string,
    reason: string,
  ): StockTransaction => ({
    id: `stx-${n}`,
    ingredientId,
    ingredientName: names[ingredientId],
    type: kind === "in" ? "stock_in" : "stock_out",
    quantityChange: kind === "in" ? qty : -qty,
    previousStock: kind === "in" ? remaining - qty : remaining + qty,
    newStock: remaining,
    reason,
    createdAt: when.toISOString(),
    createdBy: by,
  });
  const yday = (h: number, m: number) => at(now, 1, h, m);
  const week = at(now, 2, 16, 55);
  return [
    row(9, "i-caramel", "in", 100, 772, yday(17, 29), juan, "Delivery"),
    row(8, "i-caramel", "in", 22, 672, yday(17, 28), juan, "Delivery"),
    row(7, "i-vanilla", "out", 120, 600, week, eric, "Weekly usage"),
    row(6, "i-cup8", "out", 28, 140, week, eric, "Weekly usage"),
    row(5, "i-milk", "out", 500, 2800, week, eric, "Weekly usage"),
    row(4, "i-tablea", "out", 160, 800, week, eric, "Weekly usage"),
    row(3, "i-egg", "out", 6, 32, week, eric, "Weekly usage"),
    row(2, "i-longganisa", "out", 140, 700, week, eric, "Weekly usage"),
    row(1, "i-ube", "out", 100, 500, week, eric, "Weekly usage"),
  ];
}
