import { canCancel, computeChange, isOrderable, nextQueueNo, nextStatus, round2 } from "@gunita/contracts";
import type { CreateOrderRequest, Order, OrderFilters } from "@gunita/contracts";
import { MockError, type MockState } from "./state";
import { applyStockChange, localDay, newestFirst, type Actor } from "./stock";

export function listOrders(state: MockState, f: OrderFilters): Order[] {
  const q = f.search?.trim().toLowerCase();
  return newestFirst(
    state.orders.filter(
      (o) =>
        (!f.status || f.status === "all" || o.status === f.status) &&
        (!f.date || localDay(o.createdAt) === f.date) &&
        (!q ||
          (o.orderNumber ?? "").toLowerCase().includes(q) ||
          o.items.some((it) => it.productName.toLowerCase().includes(q))),
    ),
  );
}

export function getOrder(state: MockState, id: string): Order {
  const o = state.orders.find((x) => x.id === id);
  if (!o) throw new MockError("NOT_FOUND", "Order not found.");
  return o;
}

/** Ingredient need for order lines (recipe + add-ons, times line quantity); rejects unavailable products. */
function ingredientNeed(state: MockState, items: Order["items"], checkActive: boolean): Map<string, number> {
  const need = new Map<string, number>();
  const add = (id: string, n: number) => need.set(id, (need.get(id) ?? 0) + n);
  const stockById = Object.fromEntries(state.ingredients.map((i) => [i.id, i.currentStock]));
  for (const item of items) {
    const product = state.products.find((p) => p.id === item.productId);
    const recipe = product?.ingredients ?? [];
    if (!product) throw new MockError("NOT_FOUND", `Product ${item.productName} not found.`);
    if (checkActive && isOrderable(product, recipe, stockById).reason === "unavailable") {
      throw new MockError("VALIDATION", `${product.name} is unavailable.`);
    }
    for (const r of recipe) add(r.ingredientId, r.quantity * item.quantity);
    for (const a of item.addons ?? []) add(a.ingredientId, a.quantity * item.quantity);
  }
  return need;
}

export function placeOrder(state: MockState, req: CreateOrderRequest, user: Actor, now: Date): Order {
  const change = computeChange(req.totalAmount, req.paidAmount);
  if (!change.ok) throw new MockError("VALIDATION", change.error);
  for (const item of req.items) {
    const addonSum = (item.addons ?? []).reduce((s, a) => s + a.price, 0);
    if (round2((item.unitPrice + addonSum) * item.quantity) !== round2(item.subtotal)) {
      throw new MockError("VALIDATION", `Line total mismatch for ${item.productName}.`);
    }
  }
  const need = ingredientNeed(state, req.items, true);
  for (const [id, qty] of need) {
    const ing = state.ingredients.find((i) => i.id === id);
    if (!ing) throw new MockError("NOT_FOUND", "Ingredient not found.");
    if (ing.currentStock < qty) throw new MockError("INSUFFICIENT_STOCK", `Not enough ${ing.name} in stock.`);
  }

  // All validation passed: mutate.
  const q = nextQueueNo(state.queue, now, state.settings.queuePrefix);
  state.queue = { day: q.day, seq: q.seq };
  const order: Order = {
    id: `o-${q.queueNo}`,
    clientTxId: req.clientTxId,
    orderNumber: q.queueNo,
    status: "pending",
    type: req.type,
    items: req.items.map((i) => ({ ...i })),
    totalAmount: req.totalAmount,
    taxAmount: req.taxAmount,
    discountAmount: req.discountAmount,
    paidAmount: req.paidAmount,
    changeAmount: change.change,
    paymentMethod: req.paymentMethod,
    createdAt: now.toISOString(),
    createdBy: user.id,
    cashierName: user.fullName,
  };
  if (req.notes !== undefined) order.notes = req.notes;
  for (const [id, qty] of need) {
    applyStockChange(state, {
      ingredientId: id,
      type: "order_deduction",
      change: -qty,
      reason: `Order ${q.queueNo}`,
      referenceId: order.id,
      createdBy: user.fullName,
      now,
      idBase: `st-${q.queueNo}-${id}`,
    });
  }
  state.orders.push(order);
  return order;
}

export function advanceOrder(state: MockState, id: string): Order {
  const o = getOrder(state, id);
  const next = nextStatus(o.status);
  if (!next) throw new MockError("VALIDATION", `Cannot advance a ${o.status} order.`);
  o.status = next;
  return o;
}

export function cancelOrder(state: MockState, id: string, user: Actor, now: Date): Order {
  const o = getOrder(state, id);
  if (!canCancel(o.status)) throw new MockError("VALIDATION", `Cannot cancel a ${o.status} order.`);
  const need = ingredientNeed(state, o.items, false);
  const label = o.orderNumber ?? o.id;
  for (const [ingId, qty] of need) {
    applyStockChange(state, {
      ingredientId: ingId,
      type: "stock_in",
      change: qty,
      reason: `Cancelled ${label}`,
      referenceId: o.id,
      createdBy: user.fullName,
      now,
      idBase: `st-cancel-${label}-${ingId}`,
    });
  }
  o.status = "cancelled";
  return o;
}
